import "./helpers/env";
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import type { Request, RequestHandler, Response } from "express";
import UserModel from "../src/models/user.model";
import { loginController, registerController } from "../src/controllers/auth.controller";

const stubUser = (password: string) => ({
  _id: "507f1f77bcf86cd799439011",
  comparePassword: async (val: string) => val === password,
});

const findOneReturns = (user: unknown) =>
  mock.method(UserModel, "findOne", async () => user);

type Captured = { status?: number; body?: Record<string, unknown> };

const fakeRes = (captured: Captured) =>
  ({
    cookie: () => fakeRes(captured),
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
const call = async (handler: RequestHandler, body: Record<string, unknown>) => {
  const captured: Captured = {};
  let failure: unknown;
  await handler({ body } as Request, fakeRes(captured), (err?: unknown) => {
    failure = err;
  });
  if (failure) throw failure;
  return captured;
};

const registerBody = {
  name: "Yeabsira Tesfaye",
  userName: "yeabwang",
  password: "hunter2hunter2",
};

test("registering maps to 201", async (t) => {
  findOneReturns(null);
  mock.method(UserModel, "create", async () => stubUser("hunter2hunter2"));
  t.after(() => mock.restoreAll());

  const { status, body } = await call(registerController, registerBody);
  assert.equal(status, 201);
  assert.equal(body?.message, "Account created");
});

test("registering a taken username maps to 409", async (t) => {
  findOneReturns(stubUser("hunter2hunter2"));
  t.after(() => mock.restoreAll());

  await assert.rejects(
    call(registerController, registerBody),
    (err: { statusCode?: number }) => err.statusCode === 409,
  );
});

test("signing in maps to 200", async (t) => {
  findOneReturns(stubUser("hunter2hunter2"));
  t.after(() => mock.restoreAll());

  const { status, body } = await call(loginController, {
    userName: "yeabwang",
    password: "hunter2hunter2",
  });
  assert.equal(status, 200);
  assert.equal(body?.message, "Signed in");
});

test("a wrong password maps to 401", async (t) => {
  findOneReturns(stubUser("hunter2hunter2"));
  t.after(() => mock.restoreAll());

  await assert.rejects(
    call(loginController, { userName: "yeabwang", password: "wrongpassword" }),
    (err: { statusCode?: number }) => err.statusCode === 401,
  );
});

test("an unknown username maps to 401, not 404", async (t) => {
  findOneReturns(null);
  t.after(() => mock.restoreAll());

  await assert.rejects(
    call(loginController, { userName: "ghost", password: "hunter2hunter2" }),
    (err: { statusCode?: number }) => err.statusCode === 401,
  );
});

test("invalid input maps to a validation error", async (t) => {
  t.after(() => mock.restoreAll());
  await assert.rejects(call(loginController, { userName: "ab", password: "x" }));
});
