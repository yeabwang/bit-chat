/**
 * Client-side mirror of server/src/validators/auth.validator.ts.
 *
 * The server stays the authority; this only spares the user a round trip. Field
 * names and messages are copied verbatim so a 400 envelope replaces these
 * errors in place, with no translation layer.
 */

const rules = {
  name: (value) => {
    if (!value) return "Name is required";
    if (value.length > 60) return "Name must be at most 60 characters";
    return null;
  },
  userName: (value) => {
    if (value.length < 3) return "Username must be at least 3 characters";
    if (value.length > 30) return "Username must be at most 30 characters";
    if (!/^[a-z0-9._-]+$/.test(value))
      return "Username may only contain letters, numbers, dot, underscore and hyphen";
    return null;
  },
  password: (value) => {
    if (value.length < 8) return "Password must be at least 8 characters";
    // bcrypt silently truncates past 72 bytes, so the server caps there too
    if (value.length > 72) return "Password must be at most 72 characters";
    return null;
  },
};

/** Trim and lowercase the way the server's zod schema does. */
function normalize(values) {
  return {
    name: (values.name ?? "").trim(),
    userName: (values.userName ?? "").trim().toLowerCase(),
    password: values.password ?? "",
    confirmPassword: values.confirmPassword ?? "",
  };
}

/** Fields the endpoint accepts for this mode, ready to POST. */
export function toPayload(mode, values) {
  const { name, userName, password } = normalize(values);
  return mode === "signup" ? { name, userName, password } : { userName, password };
}

/** @returns {Record<string, string>} field name -> message, empty when valid */
export function validate(mode, values) {
  const clean = normalize(values);
  const errors = {};
  const check = (field) => {
    const message = rules[field](clean[field]);
    if (message) errors[field] = message;
  };

  if (mode === "signup") check("name");
  check("userName");
  check("password");
  if (mode === "signup" && clean.confirmPassword !== clean.password) {
    errors.confirmPassword = "Passwords do not match";
  }
  return errors;
}

/** Map a server error body onto the shape validate() returns. */
export function toFieldErrors(body) {
  const errors = {};
  for (const entry of body?.errors ?? []) {
    if (entry?.field && !errors[entry.field]) errors[entry.field] = entry.message;
  }
  // 401 and 409 carry no per-field errors, so they surface at form level
  if (!Object.keys(errors).length) {
    errors._form = body?.message || "Something went wrong. Please try again.";
  }
  return errors;
}
