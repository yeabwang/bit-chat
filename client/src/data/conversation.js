
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

/**
 * The POST /api/conversations body for a set of picked user ids. One pick is a
 * DM; two or more is a group, which the server requires a name for. The server
 * validates a discriminated union on isGroup, so the wrong branch is a 400.
 */
export function newConversationPayload(picked, groupName) {
  return picked.length === 1
    ? { isGroup: false, participantId: picked[0] }
    : { isGroup: true, groupName: (groupName ?? "").trim(), participants: picked };
}

/** A thread before its first page lands. */
export const EMPTY_THREAD = { items: [], hasMore: false, nextCursor: null, loading: false };

/**
 * Put a message into a thread. `replaceId` swaps an optimistic copy for the
 * server's; without it the message is appended. Either way an id already in the
 * thread is overwritten in place, so a socket echo of our own send is not a
 * duplicate.
 */
export function putMessage(thread = EMPTY_THREAD, message, replaceId = null) {
  // drop the optimistic copy first: the socket echo can land before the POST
  // reply, in which case the server's id is already in the thread
  const items = replaceId ? thread.items.filter((m) => m._id !== replaceId) : thread.items;
  const at = items.findIndex((m) => m._id === message._id);
  return {
    ...thread,
    items: at === -1 ? [...items, message] : items.map((m, i) => (i === at ? message : m)),
  };
}

/** Prepend an older page. Its items are already oldest-first. */
export function mergeOlderPage(thread = EMPTY_THREAD, page) {
  const known = new Set(thread.items.map((m) => m._id));
  return {
    ...thread,
    items: [...page.items.filter((m) => !known.has(m._id)), ...thread.items],
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
    loading: false,
  };
}

/** Add one reader to every message they had reached when the receipt arrived. */
export function applyReadReceipt(thread = EMPTY_THREAD, readerId, readAt) {
  const reachedAt = new Date(readAt).getTime();
  if (!readerId || Number.isNaN(reachedAt)) return thread;

  return {
    ...thread,
    items: thread.items.map((message) => {
      const senderId = message.sender?._id;
      const existing = (message.readBy ?? []).map((id) => String(id?._id ?? id));
      if (
        senderId === readerId ||
        new Date(message.createdAt).getTime() > reachedAt ||
        existing.includes(readerId)
      )
        return message;
      return { ...message, readBy: [...existing, readerId] };
    }),
  };
}

/** A group message is read only after every other participant has opened it. */
export function isReadByAll(message, conversation) {
  const senderId = message?.sender?._id;
  const recipients = (conversation?.participants ?? [])
    .map((participant) => participant._id)
    .filter((id) => id !== senderId);
  const readers = new Set(
    (message?.readBy ?? []).map((id) => String(id?._id ?? id)),
  );
  return recipients.length > 0 && recipients.every((id) => readers.has(id));
}

/**
 * Socket reducers. Each takes the current list and returns the next one; the
 * caller decides what "active" means. Kept pure so node --test covers them.
 */

/** Insert, or replace when the id is already known (a repeat DM answers with the same thread). */
export function upsertConversation(conversations, conversation) {
  return conversations.some((c) => c._id === conversation._id)
    ? conversations.map((c) => (c._id === conversation._id ? conversation : c))
    : [conversation, ...conversations];
}

/**
 * Replace in place, keeping the local unread count. Never reorders: a rename
 * is not activity and the server does not move lastActivityAt for one.
 */
export function replaceConversation(conversations, conversation) {
  return conversations.map((c) =>
    c._id === conversation._id
      ? {
          ...conversation,
          unreadCount: c.unreadCount ?? 0,
          // rename / add-members responses carry lastMessage as a bare id: keep the local preview
          lastMessage: conversation.lastMessage?.sender ? conversation.lastMessage : c.lastMessage,
        }
      : c,
  );
}

/**
 * message:new for the sidebar. Bumps preview and activity, and counts unread
 * unless the thread is open on screen or the message is our own socket echo.
 * Only moves forward: an echo of an older send must not pull the row back up
 * the list.
 */
export function applyMessageToList(conversations, message, activeId, meId) {
  return conversations.map((c) => {
    if (c._id !== message.conversationId) return c;
    const forward = new Date(message.createdAt) >= new Date(c.lastActivityAt ?? 0);
    return {
      ...c,
      ...(forward ? { lastMessage: message, lastActivityAt: message.createdAt } : {}),
      unreadCount:
        c._id === activeId || message.sender?._id === meId
          ? (c._id === activeId ? 0 : (c.unreadCount ?? 0))
          : (c.unreadCount ?? 0) + 1,
    };
  });
}
