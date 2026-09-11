import { request } from "./client.js";
import { withAvatar } from "../lib/avatar.js";

// accounts created without one store avatar: null, so fill it before it reaches a component
export const normalize = (conversation) => ({
  ...conversation,
  participants: (conversation.participants ?? []).map(withAvatar),
  lastMessage: conversation.lastMessage?.sender
    ? { ...conversation.lastMessage, sender: withAvatar(conversation.lastMessage.sender) }
    : conversation.lastMessage,
});

// GET /api/conversations - lastActivityAt desc, participants and lastMessage populated
export const listConversations = () =>
  request("/api/conversations").then((r) => r.conversations.map(normalize));

/**
 * POST /api/conversations
 * DM:    { isGroup: false, participantId }
 * group: { isGroup: true, groupName, participants: [id, id, ...] }
 * A repeat DM answers 200 with the existing thread instead of creating one.
 */
export const createConversation = (payload) =>
  request("/api/conversations", { method: "POST", body: payload }).then(
    (r) => normalize(r.conversation),
  );

// PATCH /api/conversations/:id - { groupName }
export const renameGroup = (id, groupName) =>
  request(`/api/conversations/${id}`, { method: "PATCH", body: { groupName } }).then(
    (r) => normalize(r.conversation),
  );

// POST /api/conversations/:id/members - { members: [id, ...] }
export const addMembers = (id, members) =>
  request(`/api/conversations/${id}/members`, { method: "POST", body: { members } }).then(
    (r) => normalize(r.conversation),
  );

// POST /api/conversations/:id/read - everything up to now is seen by the caller
export const markRead = (id) =>
  request(`/api/conversations/${id}/read`, { method: "POST" });

// DELETE /api/conversations/:id/members/me
export const leaveConversation = (id) =>
  request(`/api/conversations/${id}/members/me`, { method: "DELETE" });
