import { request } from "./client.js";
import { withAvatar } from "../lib/avatar.js";

// sender and the quoted message's sender are populated with name/userName/avatar
export const normalize = (message) => ({
  ...message,
  sender: withAvatar(message.sender),
  replyTo: message.replyTo
    ? { ...message.replyTo, sender: withAvatar(message.replyTo.sender) }
    : message.replyTo,
});

/**
 * GET /api/conversations/:id/messages
 * Walks backwards from the newest message but hands each page back oldest-first,
 * so an older page prepends as-is. `nextCursor` is the oldest id of this page.
 */
export const listMessages = (conversationId, { cursor, limit } = {}) => {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (limit) params.set("limit", String(limit));
  const query = params.toString();

  return request(
    `/api/conversations/${conversationId}/messages${query ? `?${query}` : ""}`,
  ).then((r) => ({
    items: r.items.map(normalize),
    hasMore: r.hasMore,
    nextCursor: r.nextCursor,
  }));
};

// POST /api/conversations/:id/messages - the saved copy, populated like a history item
export const sendMessage = (conversationId, body) =>
  request(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    body,
  }).then((r) => normalize(r.newMessage));
