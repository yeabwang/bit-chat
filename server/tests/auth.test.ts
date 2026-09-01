import test, { mock } from "node:test";
import assert from "node:assert/strict";
import UserModel from "../src/models/user.model";
import { loginService, registerService } from "../src/services/auth.service";
import { loginSchema, registerSchema } from "../src/validators/auth.validator";
import { compareValue, hashValue } from "../src/utils/bcrypt";

const AVATAR = "https://avatars.githubusercontent.com/u/122813658?v=4";

const stubUser = (password: string) => ({
  _id: "id",
  comparePassword: async (val: string) => val === password,
});

const findOneReturns = (user: unknown) =>
  mock.method(UserModel, "findOne", async () => user);

const registerBody = (over: Record<string, unknown> = {}) => ({
  name: "Yeabsira Tesfaye",
  userName: "yeabwang",
  password: "hunter2hunter2",
  ...over,
});

test("registerSchema normalises the username and keeps the display name", () => {
  const parsed = registerSchema.parse(
    registerBody({ userName: "  YeabWang ", name: "  Yeabsira Tesfaye  " }),
  );
  assert.equal(parsed.userName, "yeabwang");
  assert.equal(parsed.name, "Yeabsira Tesfaye");
  assert.equal(parsed.avatar, undefined);
});

test("registerSchema rejects invalid usernames, names and passwords", () => {
  assert.throws(() => registerSchema.parse(registerBody({ userName: "ab" })));
  assert.throws(() => registerSchema.parse(registerBody({ userName: "yeab wang" })));
  assert.throws(() => registerSchema.parse(registerBody({ name: "   " })));
  assert.throws(() => registerSchema.parse(registerBody({ password: "short" })));
});

test("registerSchema accepts an http(s) avatar and rejects other schemes", () => {
  assert.equal(registerSchema.parse(registerBody({ avatar: AVATAR })).avatar, AVATAR);
  assert.throws(() =>
    registerSchema.parse(registerBody({ avatar: "javascript:alert(1)" })),
  );
  assert.throws(() => registerSchema.parse(registerBody({ avatar: "not a url" })));
});

test("loginSchema only accepts a username and password", () => {
  const parsed = loginSchema.parse({
    userName: "  YeabWang ",
    password: "hunter2hunter2",
  });
  assert.deepEqual(parsed, {
    userName: "yeabwang",
    password: "hunter2hunter2",
  });
});

test("registerService creates the account with its name and avatar", async (t) => {
  findOneReturns(null);
  const create = mock.method(UserModel, "create", async () => stubUser("hunter2hunter2"));
  t.after(() => mock.restoreAll());

  await registerService(registerSchema.parse(registerBody({ avatar: AVATAR })));

  assert.deepEqual(create.mock.calls[0].arguments[0], {
    name: "Yeabsira Tesfaye",
    userName: "yeabwang",
    password: "hunter2hunter2",
    avatar: AVATAR,
  });
});

test("registerService rejects a username that is already taken", async (t) => {
  findOneReturns(stubUser("hunter2hunter2"));
  const create = mock.method(UserModel, "create", async () => stubUser("hunter2hunter2"));
  t.after(() => mock.restoreAll());

  await assert.rejects(
    registerService(registerSchema.parse(registerBody())),
    /already taken/,
  );
  assert.equal(create.mock.callCount(), 0);
});

test("loginService authenticates on a matching password", async (t) => {
  findOneReturns(stubUser("hunter2hunter2"));
  t.after(() => mock.restoreAll());

  const user = await loginService({
    userName: "yeabwang",
    password: "hunter2hunter2",
  });
  assert.equal(user._id, "id");
});

const rejectionMessage = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return (error as Error).message;
  }
  return assert.fail("expected the call to reject");
};

test("loginService gives the same error for a wrong password and an unknown name", async (t) => {
  t.after(() => mock.restoreAll());

  findOneReturns(stubUser("hunter2hunter2"));
  const wrongPassword = await rejectionMessage(() =>
    loginService({ userName: "yeabwang", password: "wrongpassword" }),
  );

  mock.restoreAll();
  findOneReturns(null);
  const unknownName = await rejectionMessage(() =>
    loginService({ userName: "ghost", password: "hunter2hunter2" }),
  );

  assert.equal(wrongPassword, "Invalid username or password");
  assert.equal(unknownName, wrongPassword);
});

test("passwords round-trip through hashing", async () => {
  const hash = await hashValue("hunter2hunter2");
  assert.notEqual(hash, "hunter2hunter2");
  assert.ok(await compareValue("hunter2hunter2", hash));
  assert.equal(await compareValue("wrongpassword", hash), false);
});
