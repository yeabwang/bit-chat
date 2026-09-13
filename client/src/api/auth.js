import { request } from "./client.js";

// POST /api/auth/register - also sets the session cookie
export const register = (payload) =>
  request("/api/auth/register", { method: "POST", body: payload }).then((r) => r.user);

// POST /api/auth/login - same cookie, 401 on bad credentials
export const login = (payload) =>
  request("/api/auth/login", { method: "POST", body: payload }).then((r) => r.user);

// POST /api/auth/logout - clears the cookie and drops the user's sockets
export const logout = () => request("/api/auth/logout", { method: "POST" });

// GET /api/auth/status - 401 when there is no valid session
export const status = () => request("/api/auth/status").then((r) => r.user);
