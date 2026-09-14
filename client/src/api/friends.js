import { request } from "./client.js";
import { withAvatar } from "../lib/avatar.js";

const normalizeRow = (row) => ({ ...row, user: withAvatar(row.user) });

// GET /api/friends - accepted friendships owned by the signed-in user
export const listFriends = () =>
  request("/api/friends").then((response) => response.data.map(normalizeRow));

// GET /api/friends/requests - only requests sent or received by the caller
export const listFriendRequests = () =>
  request("/api/friends/requests").then((response) => ({
    incoming: response.incoming.map(normalizeRow),
    outgoing: response.outgoing.map(normalizeRow),
  }));

export const sendFriendRequest = (userId) =>
  request("/api/friends/requests", { method: "POST", body: { userId } });

export const acceptFriendRequest = (id) =>
  request(`/api/friends/requests/${id}/accept`, { method: "POST" });

// The same endpoint declines an incoming request or withdraws an outgoing one.
export const removeFriendRequest = (id) =>
  request(`/api/friends/requests/${id}`, { method: "DELETE" });

