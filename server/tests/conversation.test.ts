import "./helpers/env";
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import ConversationModel from "../src/models/conversation.model";
import MessageModel from "../src/models/message.model";
import UserModel from "../src/models/user.model";
import {
  createConversationService,
  dmKeyFor,
  getSingleConversationService,
  getUserConversationsService,
  markReadService,
} from "../src/services/conversation.service";
import {
  conversationIdSchema,
  createConversationSchema,
} from "../src/validators/conversation.validator";
import { callArgs, docStub, queryStub } from "./helpers/mongoose";

const ME = new Types.ObjectId("507f1f77bcf86cd799439011");
const ALICE = "507f1f77bcf86cd799439012";
const BOB = "507f1f77bcf86cd799439013";
const CONVERSATION_ID = "507f1f77bcf86cd7994390ff";

const allUsersExist = () =>
  mock.method(UserModel, "countDocuments", ((query: { _id: { $in: string[] } }) =>
    Promise.resolve(query._id.$in.length)) as never);

const noUsersExist = () =>
  mock.method(UserModel, "countDocuments", (() => Promise.resolve(0)) as never);

const upsertReturns = (conversation: unknown, updatedExisting: boolean) =>
  mock.method(ConversationModel, "findOneAndUpdate", (() =>
    Promise.resolve({
      value: conversation,
      lastErrorObject: { updatedExisting },
    })) as never);

test("createConversationSchema rejects a body that says nothing", () => {
  // this used to parse, fall through both service branches, and answer 200 with
  // an undefined conversation
  assert.throws(() => createConversationSchema.parse({}));
});

test("createConversationSchema accepts a well formed DM", () => {
  assert.deepEqual(
    createConversationSchema.parse({ isGroup: false, participantId: ALICE }),
    { isGroup: false, participantId: ALICE },
  );
});

test("createConversationSchema rejects ids that are not object ids", () => {
  assert.throws(() =>
    createConversationSchema.parse({ isGroup: false, participantId: "nope" }),
  );
  assert.throws(() => conversationIdSchema.parse({ id: "../../etc/passwd" }));
});

test("createConversationSchema holds groups to a name and two other members", () => {
  assert.throws(() =>
    createConversationSchema.parse({ isGroup: true, participants: [ALICE, BOB] }),
  );
  assert.throws(() =>
    createConversationSchema.parse({
      isGroup: true,
      groupName: "  ",
      participants: [ALICE, BOB],
    }),
  );
  assert.throws(() =>
    createConversationSchema.parse({
      isGroup: true,
      groupName: "Study",
      participants: [ALICE],
    }),
  );

  const parsed = createConversationSchema.parse({
    isGroup: true,
    groupName: "  Study  ",
    participants: [ALICE, BOB],
  });
  assert.equal(parsed.isGroup && parsed.groupName, "Study");
});

test("a DM body cannot smuggle in group fields", () => {
  const dm = createConversationSchema.parse({
    isGroup: false,
    participantId: ALICE,
    groupName: "Study",
  });
  assert.equal("groupName" in dm, false);
});

test("dmKeyFor is the same whichever way round the pair is given", () => {
  assert.equal(dmKeyFor(ALICE, BOB), dmKeyFor(BOB, ALICE));
  assert.notEqual(dmKeyFor(ALICE, BOB), dmKeyFor(ALICE, String(ME)));
});

test("you cannot open a DM with yourself", async (t) => {
  t.after(() => mock.restoreAll());
  allUsersExist();

  await assert.rejects(
    createConversationService(ME, { isGroup: false, participantId: String(ME) }),
    /with yourself/,
  );
});

test("a DM with an unknown user is a 404", async (t) => {
  t.after(() => mock.restoreAll());
  noUsersExist();
  const upsert = upsertReturns(docStub({ _id: "c" }), false);

  await assert.rejects(
    createConversationService(ME, { isGroup: false, participantId: ALICE }),
    (error: { statusCode?: number }) => error.statusCode === 404,
  );
  assert.equal(upsert.mock.callCount(), 0);
});

test("opening a DM upserts on the pair key and reports it as created", async (t) => {
  t.after(() => mock.restoreAll());
  allUsersExist();
  const upsert = upsertReturns(docStub({ _id: "c" }), false);

  const { created } = await createConversationService(ME, {
    isGroup: false,
    participantId: ALICE,
  });

  assert.equal(created, true);
  const [filter, update, options] = callArgs(upsert) as [
    { dmKey: string },
    { $setOnInsert: Record<string, unknown> },
    { upsert: boolean },
  ];
  assert.deepEqual(filter, { dmKey: dmKeyFor(String(ME), ALICE) });
  assert.equal(options.upsert, true);
  assert.deepEqual(update.$setOnInsert.participants, [String(ME), ALICE]);
  assert.equal(update.$setOnInsert.isGroup, false);
});

test("re-opening an existing DM returns it rather than making a second one", async (t) => {
  t.after(() => mock.restoreAll());
  allUsersExist();
  upsertReturns(docStub({ _id: "c" }), true);
  const create = mock.method(ConversationModel, "create", (() =>
    Promise.resolve(docStub({ _id: "other" }))) as never);

  const { created } = await createConversationService(ME, {
    isGroup: false,
    participantId: ALICE,
  });

  assert.equal(created, false);
  assert.equal(create.mock.callCount(), 0);
});

test("creating a group puts the creator in it and drops duplicates", async (t) => {
  t.after(() => mock.restoreAll());
  allUsersExist();
  const create = mock.method(ConversationModel, "create", (() =>
    Promise.resolve(docStub({ _id: "g" }))) as never);

  const { created } = await createConversationService(ME, {
    isGroup: true,
    groupName: "Study",
    participants: [ALICE, ALICE, BOB, String(ME)],
  });

  assert.equal(created, true);
  assert.deepEqual(callArgs(create)[0], {
    participants: [String(ME), ALICE, BOB],
    isGroup: true,
    groupName: "Study",
    createdBy: String(ME),
  });
});

test("a group whose members collapse to fewer than two is refused", async (t) => {
  t.after(() => mock.restoreAll());
  allUsersExist();
  const create = mock.method(ConversationModel, "create", (() =>
    Promise.resolve(docStub({ _id: "g" }))) as never);

  // passes the schema's array length check
  await assert.rejects(
    createConversationService(ME, {
      isGroup: true,
      groupName: "Study",
      participants: [ALICE, String(ME)],
    }),
    /at least two other members/,
  );
  assert.equal(create.mock.callCount(), 0);
});

test("a group naming a user who does not exist is refused", async (t) => {
  t.after(() => mock.restoreAll());
  noUsersExist();
  const create = mock.method(ConversationModel, "create", (() =>
    Promise.resolve(docStub({ _id: "g" }))) as never);

  await assert.rejects(
    createConversationService(ME, {
      isGroup: true,
      groupName: "Study",
      participants: [ALICE, BOB],
    }),
    (error: { statusCode?: number }) => error.statusCode === 404,
  );
  assert.equal(create.mock.callCount(), 0);
});

test("the conversation list is filtered to the caller and ordered by activity", async (t) => {
  t.after(() => mock.restoreAll());
  const query = queryStub([]);
  const find = mock.method(ConversationModel, "find", (() => query) as never);

  await getUserConversationsService(ME);

  assert.deepEqual(callArgs(find)[0], { participants: ME });
  // updatedAt would also reorder the sidebar on a rename, which is not activity
  assert.deepEqual(query.calls.sort[0][0], { lastActivityAt: -1 });
});

test("unreadCount counts other people's messages since the caller's read mark", async (t) => {
  t.after(() => mock.restoreAll());
  const readAt = new Date("2026-09-01T00:00:00.000Z");
  const rows = [
    { _id: CONVERSATION_ID, lastReadAt: { [String(ME)]: readAt } },
    { _id: ALICE, lastReadAt: {} },
  ];
  mock.method(ConversationModel, "find", (() => queryStub(rows)) as never);
  const count = mock.method(MessageModel, "countDocuments", (() =>
    Promise.resolve(2)) as never);

  const list = await getUserConversationsService(ME);

  assert.deepEqual(
    list.map((c) => c.unreadCount),
    [2, 2],
  );
  assert.deepEqual(callArgs(count)[0], {
    conversationId: CONVERSATION_ID,
    sender: { $ne: ME },
    createdAt: { $gt: readAt },
  });
  // never read: everything by someone else counts
  assert.deepEqual(
    (callArgs(count, 1)[0] as { createdAt: { $gt: Date } }).createdAt.$gt,
    new Date(0),
  );
});

test("marking read stamps the caller's own key and is scoped to membership", async (t) => {
  t.after(() => mock.restoreAll());
  const update = mock.method(ConversationModel, "updateOne", (() =>
    Promise.resolve({ matchedCount: 1 })) as never);

  await markReadService(ME, CONVERSATION_ID);

  const [filter, change] = callArgs(update) as [
    Record<string, unknown>,
    Record<string, unknown>,
  ];
  assert.deepEqual(filter, { _id: CONVERSATION_ID, participants: ME });
  assert.deepEqual(Object.keys(change.$set as object), [`lastReadAt.${ME}`]);
});

test("marking read a conversation you are not in is a 404", async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(ConversationModel, "updateOne", (() =>
    Promise.resolve({ matchedCount: 0 })) as never);

  await assert.rejects(
    markReadService(ME, CONVERSATION_ID),
    (error: { statusCode?: number }) => error.statusCode === 404,
  );
});

test("a non participant gets a 404 from a conversation read", async (t) => {
  t.after(() => mock.restoreAll());
  const findOne = mock.method(ConversationModel, "findOne", (() =>
    queryStub(null)) as never);

  await assert.rejects(
    getSingleConversationService(CONVERSATION_ID, ME),
    (error: { statusCode?: number }) => error.statusCode === 404,
  );
  // membership is part of the lookup, not a check made afterwards
  assert.deepEqual(callArgs(findOne)[0], {
    _id: CONVERSATION_ID,
    participants: ME,
  });
});
