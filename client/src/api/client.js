/**
 * Fetch wrapper for the server's JSON API.
 *
 * Every response, success or failure, is one of the envelopes in
 * server/docs/auth.md. Failures throw with `.status` and `.body` attached so
 * callers can hand `.body` straight to toFieldErrors() - no translation layer.
 */

// import.meta.env is undefined outside Vite (node --test), hence the optional chain
const BASE = import.meta.env?.VITE_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || `Request failed with ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

// the server's envelope carries a human message; network failures only have error.message
export const errorMessage = (failure, fallback) =>
  failure?.body?.message ?? failure?.message ?? fallback;

export async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    // the session lives in an httpOnly cookie; without this it is never sent
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  // a 500 from a proxy may not be JSON
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, payload);
  return payload;
}
