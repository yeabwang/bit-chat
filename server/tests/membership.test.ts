import "./helpers/env";
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import ConversationModel from "../src/models/conversation.model";
import MessageModel from "../src/models/message.model";
import UserModel from "../src/models/user.model";
import {
  addMembersService,
  leaveConversationService,
  MAX_GROUP_MEMBERS,
  renameGroupService,
} from "../src/services/conversation.service";
import {
  addMembersSchema,
  renameGroupSchema,
} from "../src/validators/conversation.validator";
import { callArgs, docStub, queryStub } from "./helpers/mongoose";

const ME = new Types.ObjectId("507f1f77bcf86cd799439011");
const ALICE = "507f1f77bcf86cd799439012";
const BOB = "507f1f77bcf86cd799439013";
const CONVERSATION_ID = "507f1f77bcf86cd7994390ff";

const allUsersExist = () =>
  mock.method(UserModel, "countDocuments", ((query: { _id: { $in: string[] } }) =>
    Promise.resolve(query._id.$in.length)) as never);

// the conditional update either matches, or returns null and the service goes
// looking for which precondition failed
const updateReturns = (conversation: unknown) =>
  mock.method(ConversationModel, "findOneAndUpdate", (() =>
    queryStub(conversation)) as never);

const lookupReturns = (conversation: unknown) =>
  mock.method(ConversationModel, "findOne", (() =>
    Promise.resolve(conversation)) as never);

test("adding members needs at least one valid id", () => {
  assert.throws(() => addMembersSchema.parse({ members: [] }));
  assert.throws(() => addMembersSchema.parse({ members: ["nope"] }));
  assert.deepEqual(addMembersSchema.parse({ members: [ALICE] }), {
    members: [ALICE],
  });
});

test("a rename needs a non blank name", () => {
  assert.throws(() => renameGroupSchema.parse({ groupName: "   " }));
  assert.throws(() => renameGroupSchema.parse({ groupName: "x".repeat(61) }));
  assert.deepEqual(renameGroupSchema.parse({ groupName: "  Study  " }), {
    groupName: "Study",
  });
});

test("leaving pulls the caller out in one atomic update", async (t) => {
  t.after(() => mock.restoreAll());
  const update = updateReturns(docStub({ _id: CONVERSATION_ID }));

  await leaveConversationService(ME, CONVERSATION_ID);

  const [filter, change] = callArgs(update) as [
    Record<string, unknown>,
    Record<string, unknown>,
  ];
  // membership, existence and "is a group" all live in the filter, so there is
  // no window between checking and writing
  assert.deepEqual(filter, {
    _id: CONVERSATION_ID,
    participants: ME,
    isGroup: true,
  });
  assert.deepEqual(change, { $pull: { participants: ME } });
});

test("the last member leaving deletes the group and its messages", async (t) => {
  t.after(() => mock.restoreAll());
  updateReturns(docStub({ _id: CONVERSATION_ID, participants: [] }));
  const dropConversation = mock.method(ConversationModel, "deleteOne", (() =>
    Promise.resolve({ deletedCount: 1 })) as never);
  const dropMessages = mock.method(MessageModel, "deleteMany", (() =>
    Promise.resolve({ deletedCount: 3 })) as never);

  await leaveConversationService(ME, CONVERSATION_ID);

  assert.deepEqual(callArgs(dropConversation)[0], { _id: CONVERSATION_ID });
  assert.deepEqual(callArgs(dropMessages)[0], { conversationId: CONVERSATION_ID });
});

test("leaving a direct message is refused, not silently ignored", async (t) => {
  t.after(() => mock.restoreAll());
  updateReturns(null);
  lookupReturns({ _id: CONVERSATION_ID, isGroup: false });

  await assert.rejects(
    leaveConversationService(ME, CONVERSATION_ID),
    (error: { statusCode?: number; message: string }) =>
      error.statusCode === 400 && /group conversations/.test(error.message),
  );
});

test("leaving a conversation you are not in is a 404", async (t) => {
  t.after(() => mock.restoreAll());
  updateReturns(null);
  lookupReturns(null);

  await assert.rejects(
    leaveConversationService(ME, CONVERSATION_ID),
    (error: { statusCode?: number }) => error.statusCode === 404,
  );
});

test("adding members is idempotent and caps the group in the filter", async (t) => {
  t.after(() => mock.restoreAll());
  allUsersExist();
  const update = updateReturns(docStub({ _id: CONVERSATION_ID }));

  await addMembersService(ME, CONVERSATION_ID, { members: [ALICE, BOB] });

  const [filter, change] = callArgs(update) as [
    Record<string, unknown>,
    Record<string, unknown>,
  ];
  assert.equal(filter.isGroup, true);
  assert.equal(filter.participants, ME);
  // the size check rides in the filter so two concurrent adds cannot each see
  // room for themselves and straddle the cap
  assert.deepEqual(filter.$expr, {
    $lte: [{ $size: "$participants" }, MAX_GROUP_MEMBERS - 2],
  });
  // $addToSet, so re-adding an existing member is a no-op rather than a duplicate
  assert.deepEqual(change, {
    $addToSet: { participants: { $each: [ALICE, BOB] } },
  });
});

test("duplicate ids in one request are collapsed", async (t) => {
  t.after(() => mock.restoreAll());
  allUsersExist();
  const update = updateReturns(docStub({ _id: CONVERSATION_ID }));

  await addMembersService(ME, CONVERSATION_ID, {
    members: [ALICE, ALICE, BOB],
  });

  const [, change] = callArgs(update) as [
    unknown,
    { $addToSet: { participants: { $each: string[] } } },
  ];
  assert.deepEqual(change.$addToSet.participants.$each, [ALICE, BOB]);
});

test("adding a user who does not exist is refused before the update", async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(UserModel, "countDocuments", (() => Promise.resolve(0)) as never);
  const update = updateReturns(docStub({ _id: CONVERSATION_ID }));

  await assert.rejects(
    addMembersService(ME, CONVERSATION_ID, { members: [ALICE] }),
    (error: { statusCode?: number }) => error.statusCode === 404,
  );
  assert.equal(update.mock.callCount(), 0);
});

test("adding members to a DM is refused", async (t) => {
  t.after(() => mock.restoreAll());
  allUsersExist();
  updateReturns(null);
  lookupReturns({ _id: CONVERSATION_ID, isGroup: false });

  await assert.rejects(
    addMembersService(ME, CONVERSATION_ID, { members: [ALICE] }),
    (error: { statusCode?: number }) => error.statusCode === 400,
  );
});

test("a non member cannot add anyone, and gets a 404", async (t) => {
  t.after(() => mock.restoreAll());
  allUsersExist();
  updateReturns(null);
  lookupReturns(null);

  await assert.rejects(
    addMembersService(ME, CONVERSATION_ID, { members: [ALICE] }),
    (error: { statusCode?: number }) => error.statusCode === 404,
  );
});

test("a full group reports the member limit", async (t) => {
  t.after(() => mock.restoreAll());
  allUsersExist();
  updateReturns(null);
  // the conversation exists and is a group, so only the size clause can have failed
  lookupReturns({ _id: CONVERSATION_ID, isGroup: true });

  await assert.rejects(
    addMembersService(ME, CONVERSATION_ID, { members: [ALICE] }),
    /member limit/,
  );
});

test("renaming sets the name and nothing else", async (t) => {
  t.after(() => mock.restoreAll());
  const update = updateReturns(docStub({ _id: CONVERSATION_ID }));

  await renameGroupService(ME, CONVERSATION_ID, { groupName: "Study" });

  const [filter, change] = callArgs(update) as [
    Record<string, unknown>,
    { $set: Record<string, unknown> },
  ];
  assert.deepEqual(filter, {
    _id: CONVERSATION_ID,
    participants: ME,
    isGroup: true,
  });
  // a rename is not activity: touching lastActivityAt would jump the group to
  // the top of every member's sidebar
  assert.deepEqual(change.$set, { groupName: "Study" });
  assert.equal("lastActivityAt" in change.$set, false);
});

test("renaming a DM is refused", async (t) => {
  t.after(() => mock.restoreAll());
  updateReturns(null);
  lookupReturns({ _id: CONVERSATION_ID, isGroup: false });

  await assert.rejects(
    renameGroupService(ME, CONVERSATION_ID, { groupName: "Study" }),
    (error: { statusCode?: number }) => error.statusCode === 400,
  );
});
