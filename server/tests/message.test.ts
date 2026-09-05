import "./helpers/env";
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import ConversationModel from "../src/models/conversation.model";
import MessageModel from "../src/models/message.model";
import { getMessagesService, sendMessageService } from "../src/services/message.service";
import {
  messageHistoryQuerySchema,
  sendMessageSchema,
} from "../src/validators/message.validator";
import { callArgs, docStub, queryStub } from "./helpers/mongoose";

const ME = new Types.ObjectId("507f1f77bcf86cd799439011");
const ALICE = new Types.ObjectId("507f1f77bcf86cd799439012");
const CONVERSATION_ID = "507f1f77bcf86cd7994390ff";
const REPLY_ID = "507f1f77bcf86cd799439aaa";
const SENT_AT = new Date("2026-09-05T10:00:00.000Z");

const conversationStub = () =>
  docStub({ _id: CONVERSATION_ID, participants: [ME, ALICE] });

const membershipFound = (found: boolean) =>
  mock.method(ConversationModel, "findOne", (() =>
    Promise.resolve(found ? conversationStub() : null)) as never);

const createReturns = (id: string) =>
  mock.method(MessageModel, "create", (() =>
    Promise.resolve(docStub({ _id: id, createdAt: SENT_AT }))) as never);

const messageStub = (id: string) => docStub({ _id: id });

test("a message must carry text", () => {
  assert.throws(() => sendMessageSchema.parse({}));
  assert.throws(() => sendMessageSchema.parse({ content: "   " }));
  assert.throws(() => sendMessageSchema.parse({ content: "x".repeat(4001) }));

  assert.deepEqual(sendMessageSchema.parse({ content: "  hello  " }), {
    content: "hello",
  });
});

test("image uploads are no longer part of the contract", () => {
  const parsed = sendMessageSchema.parse({
    content: "hello",
    image: "https://example.com/cat.png",
  });
  assert.equal("image" in parsed, false);
});

test("replyToId must be an object id when given", () => {
  assert.throws(() => sendMessageSchema.parse({ content: "hi", replyToId: "nope" }));
  assert.equal(
    sendMessageSchema.parse({ content: "hi", replyToId: REPLY_ID }).replyToId,
    REPLY_ID,
  );
});

test("history paging options are coerced and bounded", () => {
  // query strings arrive as text
  assert.deepEqual(messageHistoryQuerySchema.parse({ limit: "50" }), {
    limit: 50,
  });
  assert.throws(() => messageHistoryQuerySchema.parse({ limit: "0" }));
  assert.throws(() => messageHistoryQuerySchema.parse({ limit: "1000" }));
  assert.throws(() => messageHistoryQuerySchema.parse({ cursor: "nope" }));
  assert.deepEqual(messageHistoryQuerySchema.parse({}), {});
});

test("sending stores the message against conversationId", async (t) => {
  t.after(() => mock.restoreAll());
  membershipFound(true);
  const create = createReturns("m1");
  mock.method(ConversationModel, "updateOne", (() =>
    Promise.resolve({ modifiedCount: 1 })) as never);

  await sendMessageService(ME, CONVERSATION_ID, { content: "hello" });

  // the field is conversationId; a stray chatId is dropped by strict mode and
  // the insert then fails validation for a missing required field
  assert.deepEqual(callArgs(create)[0], {
    conversationId: CONVERSATION_ID,
    sender: ME,
    content: "hello",
    replyTo: null,
  });
});

test("sending to a conversation you are not in is a 404 and writes nothing", async (t) => {
  t.after(() => mock.restoreAll());
  membershipFound(false);
  const create = createReturns("m1");

  await assert.rejects(
    sendMessageService(ME, CONVERSATION_ID, { content: "hello" }),
    (error: { statusCode?: number }) => error.statusCode === 404,
  );
  assert.equal(create.mock.callCount(), 0);
});

test("the conversation pointer is moved by one guarded update", async (t) => {
  t.after(() => mock.restoreAll());
  membershipFound(true);
  createReturns("m1");
  const update = mock.method(ConversationModel, "updateOne", (() =>
    Promise.resolve({ modifiedCount: 1 })) as never);

  await sendMessageService(ME, CONVERSATION_ID, { content: "hello" });

  const [filter, change] = callArgs(update) as [
    Record<string, unknown>,
    { $set: Record<string, unknown> },
  ];
  // findOne + assign + save() let a slower request overwrite the pointer with
  // an older message; $lt makes lastActivityAt monotonic instead
  assert.deepEqual(filter, {
    _id: CONVERSATION_ID,
    lastActivityAt: { $lt: SENT_AT },
  });
  assert.equal(change.$set.lastMessage, "m1");
  assert.equal(change.$set.lastActivityAt, SENT_AT);
});

test("sending updates lastActivityAt, not just lastMessage", async (t) => {
  t.after(() => mock.restoreAll());
  membershipFound(true);
  createReturns("m1");
  const update = mock.method(ConversationModel, "updateOne", (() =>
    Promise.resolve({ modifiedCount: 1 })) as never);

  await sendMessageService(ME, CONVERSATION_ID, { content: "hello" });

  // without this the sidebar never reorders when a message arrives
  const [, change] = callArgs(update) as [unknown, { $set: { lastActivityAt?: Date } }];
  assert.ok(change.$set.lastActivityAt instanceof Date);
});

test("a reply must point at a message in the same conversation", async (t) => {
  t.after(() => mock.restoreAll());
  membershipFound(true);
  const exists = mock.method(MessageModel, "exists", (() =>
    Promise.resolve(null)) as never);
  const create = createReturns("m1");

  await assert.rejects(
    sendMessageService(ME, CONVERSATION_ID, {
      content: "hi",
      replyToId: REPLY_ID,
    }),
    /Reply message not found/,
  );
  // scoping the lookup is what stops a reply quoting a message from a
  // conversation the sender cannot read
  assert.deepEqual(callArgs(exists)[0], {
    _id: REPLY_ID,
    conversationId: CONVERSATION_ID,
  });
  assert.equal(create.mock.callCount(), 0);
});

test("the participant list comes back for fanout", async (t) => {
  t.after(() => mock.restoreAll());
  membershipFound(true);
  createReturns("m1");
  mock.method(ConversationModel, "updateOne", (() =>
    Promise.resolve({ modifiedCount: 1 })) as never);

  const { participantIds } = await sendMessageService(ME, CONVERSATION_ID, {
    content: "hello",
  });

  assert.deepEqual(participantIds, [String(ME), String(ALICE)]);
});

const historyReturns = (messages: unknown[]) => {
  const query = queryStub(messages);
  const find = mock.method(MessageModel, "find", (() => query) as never);
  return { query, find };
};

const isParticipant = (yes: boolean) =>
  mock.method(ConversationModel, "exists", (() =>
    Promise.resolve(yes ? { _id: CONVERSATION_ID } : null)) as never);

test("history is scoped to the conversation and walked newest first", async (t) => {
  t.after(() => mock.restoreAll());
  isParticipant(true);
  const { query, find } = historyReturns([]);

  await getMessagesService(ME, CONVERSATION_ID, {});

  assert.deepEqual(callArgs(find)[0], { conversationId: CONVERSATION_ID });
  // _id, not createdAt: two messages in the same millisecond tie on createdAt,
  // and a tied cursor either repeats or skips a row
  assert.deepEqual(query.calls.sort[0][0], { _id: -1 });
});

test("a page is returned oldest first even though it is fetched newest first", async (t) => {
  t.after(() => mock.restoreAll());
  isParticipant(true);
  historyReturns([messageStub("m3"), messageStub("m2"), messageStub("m1")]);

  const { items } = await getMessagesService(ME, CONVERSATION_ID, { limit: 3 });

  assert.deepEqual(
    items.map((message) => String(message._id)),
    ["m1", "m2", "m3"],
  );
});

test("a full page reports hasMore and a cursor at its oldest message", async (t) => {
  t.after(() => mock.restoreAll());
  isParticipant(true);
  // the service asks for limit + 1 to answer hasMore without a count query
  historyReturns([messageStub("m3"), messageStub("m2"), messageStub("m1")]);

  const { items, hasMore, nextCursor } = await getMessagesService(ME, CONVERSATION_ID, {
    limit: 2,
  });

  assert.equal(items.length, 2);
  assert.equal(hasMore, true);
  assert.equal(nextCursor, "m2", "the oldest row actually returned");
});

test("a short page reports the end of the history", async (t) => {
  t.after(() => mock.restoreAll());
  isParticipant(true);
  historyReturns([messageStub("m1")]);

  const { hasMore, nextCursor } = await getMessagesService(ME, CONVERSATION_ID, {
    limit: 30,
  });

  assert.equal(hasMore, false);
  assert.equal(nextCursor, null);
});

test("a cursor pages strictly backwards", async (t) => {
  t.after(() => mock.restoreAll());
  isParticipant(true);
  const { find } = historyReturns([]);

  await getMessagesService(ME, CONVERSATION_ID, { cursor: REPLY_ID });

  assert.deepEqual(callArgs(find)[0], {
    conversationId: CONVERSATION_ID,
    _id: { $lt: REPLY_ID },
  });
});

test("history for a conversation you are not in is a 404 and reads nothing", async (t) => {
  t.after(() => mock.restoreAll());
  isParticipant(false);
  const { find } = historyReturns([]);

  await assert.rejects(
    getMessagesService(ME, CONVERSATION_ID, {}),
    (error: { statusCode?: number }) => error.statusCode === 404,
  );
  assert.equal(find.mock.callCount(), 0);
});
