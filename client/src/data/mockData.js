import { ASSETS } from "./assets";

/*
 *   users                  -> GET /api/users
 *   conversations          -> GET /api/conversations (lastActivityAt desc)
 *   messagesByConversation -> GET /api/conversations/:id/messages
 */

const iso = (minutesAgo) => new Date(Date.now() - minutesAgo * 60000).toISOString();

export const currentUser = {
  _id: "u0",
  name: "Yeabsira Tesfaye",
  userName: "yeabwang",
  avatar: ASSETS.avatar4,
};

export const users = [
  { _id: "u1", name: "Eleanor Pena", userName: "eleanor", avatar: ASSETS.avatar1, isOnline: true },
  { _id: "u2", name: "Jenny Wilson", userName: "jenny", avatar: ASSETS.avatar2, isOnline: true },
  { _id: "u3", name: "Jane Cooper", userName: "janec", avatar: ASSETS.avatar3, isOnline: true },
  { _id: "u4", name: "Jacob Jones", userName: "jacob", avatar: ASSETS.avatar5, isOnline: true },
  { _id: "u5", name: "Arlene McCoy", userName: "arlene", avatar: ASSETS.avatar6, isOnline: false },
  { _id: "u6", name: "Brooklyn Simmons", userName: "brooklyn", avatar: ASSETS.avatar7, isOnline: false },
  { _id: "u7", name: "Floyd Miles", userName: "floyd", avatar: ASSETS.avatar8, isOnline: false },
  { _id: "u8", name: "Diana Prince", userName: "diana", avatar: ASSETS.avatar9, isOnline: true },
  { _id: "u9", name: "Robert Fox", userName: "robert", avatar: ASSETS.avatar10, isOnline: false },
  { _id: "u10", name: "Kristin Watson", userName: "kristin", avatar: ASSETS.avatar11, isOnline: false },
  { _id: "u11", name: "Cody Fisher", userName: "cody", avatar: ASSETS.avatar12, isOnline: false },
];

const byId = Object.fromEntries(users.map((u) => [u._id, u]));
const dmKey = (a, b) => [a, b].sort().join(":");

const dm = (id, peerId, content, senderId, minutesAgo, unread = 0) => ({
  _id: id,
  isGroup: false,
  groupName: null,
  dmKey: dmKey(currentUser._id, peerId),
  participants: [currentUser, byId[peerId]],
  createdBy: currentUser._id,
  lastMessage: { content, sender: byId[senderId] ?? currentUser, createdAt: iso(minutesAgo) },
  lastActivityAt: iso(minutesAgo),
  unreadCount: unread,
});

const group = (id, groupName, memberIds, content, senderId, minutesAgo, unread = 0) => ({
  _id: id,
  isGroup: true,
  groupName,
  participants: [currentUser, ...memberIds.map((m) => byId[m])],
  createdBy: currentUser._id,
  lastMessage: { content, sender: byId[senderId] ?? currentUser, createdAt: iso(minutesAgo) },
  lastActivityAt: iso(minutesAgo),
  unreadCount: unread,
});

export const conversations = [
  group("c1", "Design team", ["u8", "u9", "u10", "u11"], "This new dashboard page. What do you think?", "u9", 4, 4),
  dm("c2", "u1", "Sounds good, see you then", "u1", 26),
  dm("c3", "u2", "If we can, tomorrow", "u2", 95),
  group("c4", "Project Bit-chat", ["u2", "u3", "u5"], "Pushed the socket fanout fix", "u3", 140, 1),
  dm("c5", "u3", "Thanks for the review", "u0", 190),
  dm("c6", "u5", "I will send the file over", "u5", 320),
  group("c7", "Weekend plans", ["u6", "u7", "u1"], "Anyone free Saturday?", "u6", 500),
  dm("c8", "u7", "Perfect, that works", "u7", 720),
];

const say = (id, conversationId, senderId, content, minutesAgo) => ({
  _id: id,
  conversationId,
  sender: senderId === currentUser._id ? currentUser : byId[senderId],
  content,
  replyTo: null,
  createdAt: iso(minutesAgo),
});

/** Keyed by conversation id, the same shape the client keeps at runtime. */
export const messagesByConversation = {
  c1: [
    say("m1", "c1", "u8", "Professional!", 58),
    say("m2", "c1", "u9", "This new dashboard page. What do you think?", 52),
    say("m3", "c1", "u9", "Still rough around the edges but the shape is there.", 51),
    say("m4", "c1", "u10", "Wow it looks amazing.", 34),
    say("m5", "c1", "u0", "Agreed. The spacing on the sidebar needs one more pass.", 22),
    say("m6", "c1", "u11", "What kind of font did you use?", 8),
    say("m7", "c1", "u9", "Poppins throughout.", 4),
  ],
  c2: [
    say("m8", "c2", "u1", "Are we still on for the review?", 40),
    say("m9", "c2", "u0", "Yes, 3pm works for me.", 33),
    say("m10", "c2", "u1", "Sounds good, see you then", 26),
  ],
  c3: [
    say("m11", "c3", "u0", "Did you get a chance to look at the draft?", 120),
    say("m12", "c3", "u2", "Not yet, swamped today.", 100),
    say("m13", "c3", "u2", "If we can, tomorrow", 95),
  ],
  c4: [
    say("m14", "c4", "u5", "The reconnect path was dropping the room join.", 160),
    say("m15", "c4", "u3", "Pushed the socket fanout fix", 140),
  ],
  c5: [say("m16", "c5", "u0", "Thanks for the review", 190)],
  c6: [say("m17", "c6", "u5", "I will send the file over", 320)],
  c7: [say("m18", "c7", "u6", "Anyone free Saturday?", 500)],
  c8: [say("m19", "c8", "u7", "Perfect, that works", 720)],
};

export const onlineUserIds = new Set(users.filter((u) => u.isOnline).map((u) => u._id));

/** No endpoints yet*/
export const friendRequests = {
  incoming: [
    { _id: "fr1", user: byId.u2, createdAt: iso(90) },
    { _id: "fr2", user: byId.u3, createdAt: iso(600) },
    { _id: "fr3", user: byId.u6, createdAt: iso(2100) },
  ],
  outgoing: [{ _id: "fr4", user: byId.u9, createdAt: iso(300) }],
};
