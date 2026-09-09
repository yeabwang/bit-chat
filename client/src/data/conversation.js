
const RUN_WINDOW_MS = 5 * 60 * 1000;

/** The participant who is not the signed-in user. Only meaningful on a DM. */
export function otherParticipant(conversation, meId) {
  const participants = conversation?.participants ?? [];
  return participants.find((p) => p._id !== meId) ?? participants[0] ?? null;
}

export function titleOf(conversation, meId) {
  if (conversation?.isGroup) return conversation.groupName || "Untitled group";
  return otherParticipant(conversation, meId)?.name || "Unknown";
}

/** One avatar for a DM, up to `limit` for a group. Never includes the caller. */
export function avatarsOf(conversation, meId, limit = 2) {
  if (!conversation?.isGroup) {
    const other = otherParticipant(conversation, meId);
    return other ? [other] : [];
  }
  return (conversation.participants ?? []).filter((p) => p._id !== meId).slice(0, limit);
}

export function memberCount(conversation) {
  return conversation?.participants?.length ?? 0;
}

export function onlineCount(conversation, onlineIds) {
  return (conversation?.participants ?? []).filter((p) => onlineIds?.has(p._id)).length;
}

/** Groups prefix the sender: the row title is the group, so nothing else names who spoke. */
export function previewOf(conversation, meId) {
  const last = conversation?.lastMessage;
  if (!last) return "No messages yet";
  const content = last.content ?? "";
  if (!conversation.isGroup) return content;
  const who = last.sender?._id === meId ? "You" : (last.sender?.name ?? "").split(" ")[0];
  return who ? `${who}: ${content}` : content;
}

/** A DM's presence is the other person's; a group has no single online state. */
export function isPeerOnline(conversation, meId, onlineIds) {
  if (conversation?.isGroup) return false;
  const other = otherParticipant(conversation, meId);
  return Boolean(other && onlineIds?.has(other._id));
}

/** Rename, add and leave are group-only; the server answers 400 on a DM. */
export function canManage(conversation) {
  return Boolean(conversation?.isGroup);
}

/** The order GET /api/conversations returns. */
export function byActivity(a, b) {
  return new Date(b.lastActivityAt) - new Date(a.lastActivityAt);
}

export function timeOf(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function dayOf(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const today = new Date();
  if (sameDay(date, today)) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * Whether a message repeats its author heading. Messages from one sender inside
 * RUN_WINDOW_MS read as a single block, which matters most in a DM where the
 * header already names the other person.
 */
export function startsRun(message, previous) {
  if (!previous) return true;
  if (previous.sender?._id !== message.sender?._id) return true;
  const gap = new Date(message.createdAt) - new Date(previous.createdAt);
  return !(gap >= 0 && gap < RUN_WINDOW_MS);
}
