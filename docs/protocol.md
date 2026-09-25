# Client/Server Protocol

Two transports, one session.

| Transport | Carries                                    |
| --------- | ------------------------------------------ |
| HTTP      | every read and every**write**              |
| WebSocket | realtime fanout and ephemeral typing state |

Durable writes still use HTTP. Typing state is the only client-originated
socket traffic and is never stored.

---

## Connecting

```js
const socket = io(SERVER_URL, { withCredentials: true });
```

The browser attaches the `accessToken` cookie to the handshake. The server reads it out of the `Cookie` header, verifies it with the same secret and the same `aud: "user"` claim as the HTTP side, and looks the account up to confirm it still exists. Any failure rejects the handshake with `Unauthorized` before a connection exists.

### Rooms

On connect, the server puts the socket into:

| Room                | Contents                                          |
| ------------------- | ------------------------------------------------- |
| `user:<userId>`     | every socket that user has open, across tabs      |
| `conversation:<id>` | one per conversation the user is a participant of |

**Conversation rooms are joined by the server, not requested by the client.** This is why a user viewing one conversation still receives messages for the others, and it removes the failure mode where a client forgets to join and silently misses messages. Membership changes - being added to a group, leaving one - move the sockets in the same request that changes the database.

---

## Events

### Server to client

| Event                  | Sent to                    | Payload                                | When                                                 |
| ---------------------- | -------------------------- | -------------------------------------- | ---------------------------------------------------- |
| `presence:sync`        | the connecting socket      | `{ userIds: string[] }`                | immediately on connect - who is online right now     |
| `presence:online`      | everyone else              | `{ userId }`                           | a user's**first** socket connects                    |
| `presence:offline`     | everyone else              | `{ userId }`                           | a user's**last** socket disconnects                  |
| `message:new`          | `conversation:<id>`        | `{ message }`                          | a message was sent                                   |
| `conversation:new`     | `user:<id>` of each member | `{ conversation }`                     | a conversation was created, or you were added to one |
| `conversation:updated` | `conversation:<id>`        | `{ conversation }`                     | renamed, or the member list changed                  |
| `conversation:removed` | `user:<id>` of the leaver  | `{ conversationId }`                   | you left                                             |
| `conversation:read`    | `conversation:<id>`        | `{ conversationId, readerId, readAt }` | a participant read through `readAt`                  |
| `friendship:changed`   | both users                 | `{}`                                   | a request or friendship changed                      |
| `typing:start`         | other conversation members | `{ conversationId, userId }`           | a member began typing                                |
| `typing:stop`          | other conversation members | `{ conversationId, userId }`           | a member stopped typing                              |

`message` and `conversation` are exactly the objects the REST endpoints return - see [`messages`](./messages.md) and [`conversations`](./conversations.md).

### Client to server

The client may emit `typing:start` or `typing:stop` with `{ conversationId }`.
The server validates the id and confirms membership before forwarding either
event. All durable actions remain HTTP requests.

| To do this          | Call this                                  | You will then receive  |
| ------------------- | ------------------------------------------ | ---------------------- |
| Send a message      | `POST /api/conversations/:id/messages`     | `message:new`          |
| Start a DM or group | `POST /api/conversations`                  | `conversation:new`     |
| Add members         | `POST /api/conversations/:id/members`      | `conversation:updated` |
| Rename a group      | `PATCH /api/conversations/:id`             | `conversation:updated` |
| Leave a group       | `DELETE /api/conversations/:id/members/me` | `conversation:removed` |
| Mark a thread read  | `POST /api/conversations/:id/read`         | `conversation:read`    |

---

## Server state

| State                          | Lives in          | Lifetime       |
| ------------------------------ | ----------------- | -------------- |
| Users, conversations, messages | MongoDB           | durable        |
| Room membership                | socket.io         | the connection |
| Who is online                  | `lib/presence.ts` | the process    |

### The presence registry

```ts
const socketsByUser = new Map<string, Set<string>>(); // userId -> socket ids
```

Both mutators restore it before returning: `addSocket` reports whether this was the first socket, `removeSocket` deletes the whole entry once the set empties and reports whether that was the last. Presence events fire on those two transitions only, so opening a second tab does not re-announce a user, and closing one of two does not sign them out.

---

## Client state

| State                    | Shape                                           | Fed by                                       |
| ------------------------ | ----------------------------------------------- | -------------------------------------------- |
| `authStatus`             | `loading` / `authenticated` / `unauthenticated` | `GET /api/auth/status` on start              |
| `user`                   | the signed-in user                              | `GET /api/auth/status`                       |
| `conversations`          | list, ordered by`lastActivityAt` desc           | `GET /api/conversations`, then socket events |
| `activeConversationId`   | one id, or none                                 | the user's selection                         |
| `messagesByConversation` | `{ [conversationId]: Message[] }`               | `GET .../messages`, then `message:new`       |
| `onlineUserIds`          | a set                                           | `presence:sync`, then `presence:*`           |

### Handling `message:new`

One event drives both halves of the UI:

1. Append to `messagesByConversation[conversationId]`, de-duplicating by `_id`.
2. Set that conversation's `lastMessage` and `lastActivityAt`.
3. If it is not the active conversation, increment its unread count.
4. Re-sort the conversation list.

Step 1 needs the de-duplication because **the sender's own sockets receive `message:new` too**. Excluding the sender would leave their other tabs out of date, and the client already has to reconcile an optimistic message against the server's copy - the same `_id` check does both jobs.

### Handling the rest

| Event                          | Client does                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `presence:sync`                | replace`onlineUserIds` wholesale                                                                     |
| `presence:online`              | add the id                                                                                           |
| `presence:offline`             | remove the id                                                                                        |
| `conversation:new`             | insert into`conversations`                                                                           |
| `conversation:updated`         | replace that conversation in place; do**not** reorder                                                |
| `conversation:removed`         | drop it from`conversations` and from `messagesByConversation`; if it was active, clear the selection |
| `conversation:read`            | clear the reader's unread count and add `readerId` to reached messages                               |
| `typing:start` / `typing:stop` | add or remove `userId` from the conversation's temporary typing set                                  |

`conversation:updated` must not reorder the list. A rename is not activity, and the server does not move `lastActivityAt` for one.

### Disconnects

socket.io reconnects on its own. On reconnect the server re-runs the whole connect path - rooms are rejoined from the database, and a fresh `presence:sync` arrives - so the client should treat `presence:sync` as authoritative each time it fires, and refetch the conversation list to close any gap while it was away.

If the session has expired in the meantime, the handshake fails with `Unauthorized` and the client should route to the login screen.

Logging out closes the user's sockets server-side.

---

## Concurrency

Every rule the server relies on is enforced by the database or by the single-threaded event loop, not by application-level locking.

| Concern                                 | How it is held                                                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two clients opening the same DM at once | unique partial index on`dmKey`, plus an upsert - see [`conversations`](./conversations.md#concurrency)                                                    |
| Two messages landing together           | one conditional update guarded by`lastActivityAt: { $lt: ... }`, so the timestamp is monotonic - see [`messages`](./messages.md#ordering-and-concurrency) |
| Leaving, adding, renaming               | one conditional update whose filter carries the authorisation; no read-then-write window                                                                  |
| Duplicate members, double leaves        | `$addToSet` and `$pull` are atomic and idempotent                                                                                                         |
| Two adds straddling the member cap      | the size check rides in the update filter as`$expr` on `$size`                                                                                            |
| The online-user map                     | confined to one module and one thread; its mutators never yield mid-update, so they cannot interleave and no lock is needed                               |

---

## Manual test

Two browsers, two accounts, both in one group.

1. B sends a message. A sees it appear with no refresh.
2. A leaves the group.
3. B sends another message.
4. **A must not receive it** - no new message, no unread badge, no sidebar movement - without A having reloaded anything.
5. A calls `GET /api/conversations/<group id>`. Expect `404`.
