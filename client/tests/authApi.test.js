import test from "node:test";
import assert from "node:assert/strict";
import { login, register, status } from "../src/api/auth.js";
import { ApiError } from "../src/api/client.js";
import { avatarUrl, avatarFor } from "../src/lib/avatar.js";
import { toFieldErrors } from "../src/pages/Signup/authValidation.js";

const user = { _id: "u1", name: "Yeabsira Tesfaye", userName: "yeabwang", avatar: null };

/** Stub fetch with one canned response and capture the call. */
function stubFetch(status, body) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: status < 400, status, json: async () => body };
  };
  return calls;
}

test("login posts JSON with the session cookie and unwraps the user", async () => {
  const calls = stubFetch(200, { message: "Signed in", user });

  assert.deepEqual(await login({ userName: "yeabwang", password: "something" }), user);
  assert.equal(calls[0].url, "http://localhost:8000/api/auth/login");
  assert.equal(calls[0].init.method, "POST");
  // without this the httpOnly cookie never leaves the browser
  assert.equal(calls[0].init.credentials, "include");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    userName: "yeabwang",
    password: "something",
  });
});

test("a 400 envelope survives as field errors", async () => {
  const body = {
    message: "Validation failed",
    errors: [{ field: "password", message: "Password must be at least 8 characters" }],
    errorCode: "ERR_BAD_REQUEST",
  };
  stubFetch(400, body);

  const error = await register({ userName: "yeabwang", password: "x" }).then(
    () => null,
    (e) => e,
  );
  assert.ok(error instanceof ApiError);
  assert.equal(error.status, 400);
  assert.deepEqual(toFieldErrors(error.body), {
    password: "Password must be at least 8 characters",
  });
});

test("a 401 with no field errors surfaces at form level", async () => {
  stubFetch(401, { message: "Not authenticated", errorCode: "ERR_UNAUTHORIZED" });

  const error = await status().then(() => null, (e) => e);
  assert.equal(error.status, 401);
  assert.deepEqual(toFieldErrors(error.body), { _form: "Not authenticated" });
});

test("avatars are deterministic and fall back to the username", () => {
  assert.equal(avatarUrl("yeabwang"), avatarUrl("yeabwang"));
  assert.notEqual(avatarUrl("yeabwang"), avatarUrl("someone"));
  assert.equal(avatarFor(user), avatarUrl("yeabwang"));
  assert.equal(avatarFor({ ...user, avatar: "https://x.test/a.png" }), "https://x.test/a.png");
});
