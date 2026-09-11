import { request } from "./client.js";
import { withAvatar } from "../lib/avatar.js";

// GET /api/users - everyone but the caller, each with a live `isOnline` flag
export const listUsers = () =>
  request("/api/users").then((r) => r.users.map(withAvatar));
