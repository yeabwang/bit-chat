import "./helpers/env";
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import type { Request, RequestHandler, Response } from "express";
import UserModel from "../src/models/user.model";
import { getUsersService } from "../src/services/user.service";
import { getUsersController } from "../src/controllers/user.controller";
import { callArgs, queryStub } from "./helpers/mongoose";

const ME = new Types.ObjectId("507f1f77bcf86cd799439011");

test("the user directory excludes the caller and never carries a password", async (t) => {
  t.after(() => mock.restoreAll());
  const query = queryStub([]);
  const find = mock.method(UserModel, "find", (() => query) as never);

  await getUsersService(ME);

  assert.deepEqual(callArgs(find)[0], { _id: { $ne: ME } });
  assert.deepEqual(query.calls.select[0][0], "-password");
});

test("listing users maps to 200", async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(UserModel, "find", (() => queryStub([])) as never);

  const captured: { status?: number; body?: Record<string, unknown> } = {};
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      captured.body = body;
      return this;
    },
  } as unknown as Response;

  await (getUsersController as RequestHandler)(
    { user: { _id: ME } } as unknown as Request,
    res,
    () => {},
  );

  assert.equal(captured.status, 200);
  assert.deepEqual(captured.body?.users, []);
});
