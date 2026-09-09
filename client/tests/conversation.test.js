import test from "node:test";
import assert from "node:assert/strict";
import {
  otherParticipant,
  titleOf,
  avatarsOf,
  previewOf,
  isPeerOnline,
  canManage,
  byActivity,
  startsRun,
} from "../src/data/conversation.js";

const me = { _id: "me", name: "Yeabsira Tesfaye", userName: "yeabwang" };
const jade = { _id: "jade", name: "Jade Ali", userName: "jade" };
const tony = { _id: "tony", name: "Tony Chen", userName: "tony" };

const dm = {
  _id: "c1",
  isGroup: false,
  groupName: null,
  participants: [me, jade],
  lastMessage: { content: "Meeting at 5", sender: jade },
  lastActivityAt: "2026-09-05T10:00:00.000Z",
};

const group = {
  _id: "c2",
  isGroup: true,
  groupName: "Coding group",
  participants: [me, jade, tony],
  lastMessage: { content: "Pushed it", sender: jade },
  lastActivityAt: "2026-09-06T10:00:00.000Z",
};

test("a DM is titled by the other participant, never the caller", () => {
  assert.equal(titleOf(dm, "me"), "Jade Ali");
  assert.equal(otherParticipant(dm, "me")._id, "jade");
  // and it works from the other side of the same object
  assert.equal(titleOf(dm, "jade"), "Yeabsira Tesfaye");
});

test("a group is titled by groupName", () => {
  assert.equal(titleOf(group, "me"), "Coding group");
  assert.equal(titleOf({ ...group, groupName: null }, "me"), "Untitled group");
});

test("avatars: one for a DM, a caller-free stack for a group", () => {
  assert.deepEqual(avatarsOf(dm, "me").map((p) => p._id), ["jade"]);
  assert.deepEqual(avatarsOf(group, "me").map((p) => p._id), ["jade", "tony"]);
  assert.equal(avatarsOf(group, "me", 1).length, 1);
});

test("group previews name the sender, DM previews do not", () => {
  assert.equal(previewOf(dm, "me"), "Meeting at 5");
  assert.equal(previewOf(group, "me"), "Jade: Pushed it");
  assert.equal(previewOf({ ...group, lastMessage: { content: "hi", sender: me } }, "me"), "You: hi");
  assert.equal(previewOf({ ...dm, lastMessage: null }, "me"), "No messages yet");
});

test("presence is per-person, so only a DM has a peer state", () => {
  const online = new Set(["jade"]);
  assert.equal(isPeerOnline(dm, "me", online), true);
  assert.equal(isPeerOnline(dm, "me", new Set()), false);
  assert.equal(isPeerOnline(group, "me", online), false);
});

test("rename, add and leave are group-only - the server 400s on a DM", () => {
  assert.equal(canManage(group), true);
  assert.equal(canManage(dm), false);
});

test("list order is lastActivityAt descending", () => {
  assert.deepEqual([dm, group].sort(byActivity).map((c) => c._id), ["c2", "c1"]);
});

test("consecutive messages by one sender collapse into a run", () => {
  const at = (iso, sender) => ({ sender, createdAt: iso });
  const first = at("2026-09-05T10:00:00.000Z", jade);
  assert.equal(startsRun(first, null), true);
  assert.equal(startsRun(at("2026-09-05T10:01:00.000Z", jade), first), false);
  assert.equal(startsRun(at("2026-09-05T10:01:00.000Z", tony), first), true);
  // a long pause breaks the run even for the same sender
  assert.equal(startsRun(at("2026-09-05T10:30:00.000Z", jade), first), true);
});
