import { request } from "./client.js";
import { withAvatar } from "../lib/avatar.js";

// accounts created without one store avatar: null, so fill it before it reaches a component
const normalize = (conversation) => ({
  ...conversation,
  participants: (conversation.participants ?? []).map(withAvatar),
  lastMessage: conversation.lastMessage
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
