import test from "node:test";
import assert from "node:assert/strict";
import {
  addSocket,
  isOnline,
  onlineUserIds,
  removeSocket,
  resetPresence,
  socketCountFor,
} from "../src/lib/presence";

const ALICE = "alice";
const BOB = "bob";

test("a user is online from their first socket until their last", (t) => {
  t.after(resetPresence);

  assert.equal(isOnline(ALICE), false);
  assert.equal(addSocket(ALICE, "s1"), true, "first socket reports coming online");
  assert.equal(isOnline(ALICE), true);
  assert.equal(removeSocket(ALICE, "s1"), true, "last socket reports going offline");
  assert.equal(isOnline(ALICE), false);
});

test("a second tab does not displace the first", (t) => {
  t.after(resetPresence);

  addSocket(ALICE, "tab1");
  assert.equal(addSocket(ALICE, "tab2"), false, "already online, no event");
  assert.equal(socketCountFor(ALICE), 2);

  // the old Map<string, string> registry kept one socket per user, so closing
  // whichever tab connected last marked the user offline while the other was
  // still open
  assert.equal(removeSocket(ALICE, "tab2"), false, "still has tab1");
  assert.equal(isOnline(ALICE), true);

  assert.equal(removeSocket(ALICE, "tab1"), true);
  assert.equal(isOnline(ALICE), false);
});

test("closing tabs in the order they were opened also works", (t) => {
  t.after(resetPresence);

  addSocket(ALICE, "tab1");
  addSocket(ALICE, "tab2");

  assert.equal(removeSocket(ALICE, "tab1"), false);
  assert.equal(isOnline(ALICE), true);
  assert.equal(removeSocket(ALICE, "tab2"), true);
  assert.equal(isOnline(ALICE), false);
});

test("an emptied user is dropped, keeping present-iff-non-empty true", (t) => {
  t.after(resetPresence);

  addSocket(ALICE, "s1");
  addSocket(BOB, "s2");
  assert.deepEqual(onlineUserIds().sort(), [ALICE, BOB]);

  removeSocket(ALICE, "s1");
  assert.deepEqual(onlineUserIds(), [BOB]);
  assert.equal(socketCountFor(ALICE), 0);
});

test("removing a socket that was never added changes nothing", (t) => {
  t.after(resetPresence);

  assert.equal(removeSocket(ALICE, "ghost"), false);
  assert.deepEqual(onlineUserIds(), []);

  addSocket(ALICE, "s1");
  assert.equal(removeSocket(ALICE, "ghost"), false, "wrong id must not sign them out");
  assert.equal(isOnline(ALICE), true);
});

test("the same socket added twice is still one socket", (t) => {
  t.after(resetPresence);

  addSocket(ALICE, "s1");
  addSocket(ALICE, "s1");
  assert.equal(socketCountFor(ALICE), 1);
  assert.equal(removeSocket(ALICE, "s1"), true);
});
