import test from "node:test";
import assert from "node:assert/strict";
import { validate, toPayload, toFieldErrors } from "../src/pages/Signup/authValidation.js";

const ok = { name: "Yeabsira Tesfaye", userName: "yeabwang", password: "something" };

test("accepts a valid signup and a valid signin", () => {
  assert.deepEqual(validate("signup", { ...ok, confirmPassword: ok.password }), {});
  assert.deepEqual(validate("signin", ok), {});
});

test("signin ignores name and confirmPassword", () => {
  assert.deepEqual(validate("signin", { userName: "yeabwang", password: "something" }), {});
});

test("enforces the server's username rules", () => {
  assert.match(validate("signin", { ...ok, userName: "ab" }).userName, /at least 3/);
  assert.match(validate("signin", { ...ok, userName: "a".repeat(31) }).userName, /at most 30/);
  assert.match(validate("signin", { ...ok, userName: "yeab wang" }).userName, /may only contain/);
  // trimmed and lowercased before checking, same as zod
  assert.deepEqual(validate("signin", { ...ok, userName: "  YeabWang  " }), {});
});

test("enforces the server's password bounds", () => {
  assert.match(validate("signin", { ...ok, password: "short" }).password, /at least 8/);
  assert.match(validate("signin", { ...ok, password: "x".repeat(73) }).password, /at most 72/);
});

test("signup requires a name and a matching confirmation", () => {
  assert.match(validate("signup", { ...ok, name: "   ", confirmPassword: ok.password }).name, /required/);
  assert.match(validate("signup", { ...ok, confirmPassword: "different" }).confirmPassword, /do not match/);
});

test("payload carries only the fields the endpoint accepts", () => {
  assert.deepEqual(toPayload("signup", { ...ok, userName: " YEABWANG ", confirmPassword: "x" }), {
    name: "Yeabsira Tesfaye",
    userName: "yeabwang",
    password: "something",
  });
  assert.deepEqual(toPayload("signin", ok), { userName: "yeabwang", password: "something" });
});

test("server envelopes map onto field errors", () => {
  assert.deepEqual(
    toFieldErrors({
      message: "Validation failed",
      errors: [{ field: "password", message: "Password must be at least 8 characters" }],
    }),
    { password: "Password must be at least 8 characters" },
  );
  // 401 and 409 carry no per-field errors, so they surface at form level
  assert.deepEqual(toFieldErrors({ message: "Username already taken" }), {
    _form: "Username already taken",
  });
  assert.ok(toFieldErrors(undefined)._form);
});
