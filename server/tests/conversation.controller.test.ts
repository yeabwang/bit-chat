import "./helpers/env";
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import type { Request, RequestHandler, Response } from "express";
import ConversationModel from "../src/models/conversation.model";
import UserModel from "../src/models/user.model";
import {
  createConversationController,
  getSingleConversationController,
  getUserConversationsController,
} from "../src/controllers/conversation.controller";
import { docStub, queryStub } from "./helpers/mongoose";

const ME = new Types.ObjectId("507f1f77bcf86cd799439011");
const ALICE = "507f1f77bcf86cd799439012";
const BOB = "507f1f77bcf86cd799439013";
const CONVERSATION_ID = "507f1f77bcf86cd7994390ff";

type Captured = { status?: number; body?: Record<string, unknown> };

const fakeRes = (captured: Captured) =>
  ({
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      captured.body = body;
      return this;
    },
  }) as unknown as Response;

// asyncHandler forwards failures to next() instead of throwing, so re-throw here
const call = async (
  handler: RequestHandler,
  req: { body?: unknown; params?: unknown },
) => {
  const captured: Captured = {};
  let failure: unknown;
  await handler(
    { ...req, user: { _id: ME } } as unknown as Request,
    fakeRes(captured),
    (err?: unknown) => {
      failure = err;
    },
  );
  if (failure) throw failure;
  return captured;
};

const allUsersExist = () =>
  mock.method(UserModel, "countDocuments", ((query: { _id: { $in: string[] } }) =>
    Promise.resolve(query._id.$in.length)) as never);

const upsertReturns = (updatedExisting: boolean) =>
  mock.method(ConversationModel, "findOneAndUpdate", (() =>
    Promise.resolve({
      value: docStub({ _id: CONVERSATION_ID, participants: [ME, ALICE] }),
      lastErrorObject: { updatedExisting },
    })) as never);

test("opening a brand new DM maps to 201", async (t) => {
  t.after(() => mock.restoreAll());
  allUsersExist();
  upsertReturns(false);

  const { status, body } = await call(createConversationController, {
    body: { isGroup: false, participantId: ALICE },
  });

  assert.equal(status, 201);
  assert.equal(body?.message, "Conversation created");
  assert.ok(body?.conversation);
});

test("re-opening an existing DM maps to 200, not 201", async (t) => {
  t.after(() => mock.restoreAll());
  allUsersExist();
  upsertReturns(true);

  const { status, body } = await call(createConversationController, {
    body: { isGroup: false, participantId: ALICE },
  });

  assert.equal(status, 200);
  assert.equal(body?.message, "Conversation already exists");
});

test("creating a group maps to 201", async (t) => {
  t.after(() => mock.restoreAll());
  allUsersExist();
  mock.method(ConversationModel, "create", (() =>
    Promise.resolve(
      docStub({ _id: CONVERSATION_ID, participants: [ME, ALICE, BOB] }),
    )) as never);

  const { status } = await call(createConversationController, {
    body: { isGroup: true, groupName: "Study", participants: [ALICE, BOB] },
  });

  assert.equal(status, 201);
});

test("an empty create body maps to a validation error, never a 200", async (t) => {
  t.after(() => mock.restoreAll());
  const upsert = upsertReturns(false);

  await assert.rejects(call(createConversationController, { body: {} }));
  assert.equal(upsert.mock.callCount(), 0);
});

test("listing conversations maps to 200", async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(ConversationModel, "find", (() => queryStub([])) as never);

  const { status, body } = await call(getUserConversationsController, {});

  assert.equal(status, 200);
  assert.deepEqual(body?.conversations, []);
});

test("reading a conversation returns it without a message list", async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(ConversationModel, "findOne", (() =>
    queryStub(docStub({ _id: CONVERSATION_ID }))) as never);

  const { status, body } = await call(getSingleConversationController, {
    params: { id: CONVERSATION_ID },
  });

  assert.equal(status, 200);
  assert.ok(body?.conversation);
  // history has its own paginated endpoint; two sources would drift
  assert.equal("messages" in (body ?? {}), false);
});

test("a malformed conversation id is rejected before it reaches mongoose", async (t) => {
  t.after(() => mock.restoreAll());
  const findOne = mock.method(ConversationModel, "findOne", (() =>
    queryStub(null)) as never);

  await assert.rejects(
    call(getSingleConversationController, { params: { id: "not-an-id" } }),
  );
  // a CastError here would have surfaced as a 500
  assert.equal(findOne.mock.callCount(), 0);
});

test("reading someone else's conversation maps to 404", async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(ConversationModel, "findOne", (() => queryStub(null)) as never);

  await assert.rejects(
    call(getSingleConversationController, { params: { id: CONVERSATION_ID } }),
    (error: { statusCode?: number }) => error.statusCode === 404,
  );
});
