import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptFriendRequest,
  listFriendRequests,
  listFriends,
  removeFriendRequest,
  sendFriendRequest,
} from "../src/api/friends.js";

function stubFetch(responses) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const body = responses.shift();
    return { ok: true, status: 200, json: async () => body };
  };
  return calls;
}

const person = { _id: "u2", name: "Jade Ali", userName: "jade", avatar: null };

test("friend and request lists come from the signed-in user's API", async () => {
  const calls = stubFetch([
    { data: [{ _id: "f1", user: person }] },
    {
      incoming: [{ _id: "r1", user: person }],
      outgoing: [{ _id: "r2", user: { ...person, _id: "u3" } }],
    },
  ]);

  const friends = await listFriends();
  const requests = await listFriendRequests();

  assert.equal(friends[0].user._id, "u2");
  assert.ok(friends[0].user.avatar, "missing avatars receive the normal fallback");
  assert.equal(requests.incoming.length, 1);
  assert.equal(requests.outgoing.length, 1);
  assert.equal(calls[0].url, "http://localhost:8000/api/friends");
  assert.equal(calls[1].url, "http://localhost:8000/api/friends/requests");
  assert.equal(calls[0].init.credentials, "include");
});

test("friend request actions use the real request endpoints", async () => {
  const calls = stubFetch([{}, {}, {}]);

  await sendFriendRequest("u2");
  await acceptFriendRequest("r1");
  await removeFriendRequest("r2");

  assert.deepEqual(
    calls.map(({ url, init }) => [url, init.method, init.body && JSON.parse(init.body)]),
    [
      ["http://localhost:8000/api/friends/requests", "POST", { userId: "u2" }],
      ["http://localhost:8000/api/friends/requests/r1/accept", "POST", undefined],
      ["http://localhost:8000/api/friends/requests/r2", "DELETE", undefined],
    ],
  );
});

