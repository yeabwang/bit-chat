# Bit-chat System Design

**Status:** implementation-aligned design documentation
**Repository:** `bit-chat`
**Last reconciled:** 2026-09-21

## 1. Purpose and scope

Bit-chat is a web-based, text-only instant-messaging system. It supports:

- username/password identity and a seven-day cookie-backed session;
- accepted-friend relationships;
- one-to-one direct messages and multi-member group conversations;
- durable message history, replies, unread counts, and read receipts;
- realtime message, conversation, friendship, typing, and presence updates;
- multiple simultaneous browser tabs for one account;
- a React/Vite browser client and an Express/MongoDB/Socket.IO server.

This document describes the behavior implemented in the repository. The existing endpoint documents in `server/docs/` remain the detailed API reference; this document explains how those pieces compose into a system and identifies production limitations and follow-up work.

Out of scope are voice/video calls, file or image attachments, end-to-end encryption, full-text message search, federation, multi-tenancy, native mobile clients, and horizontally scaled realtime delivery.

## 2. Design goals and invariants

The primary design goals are:

1. **Durable truth.** Users, memberships, friendships, conversations, and messages survive browser refreshes and server restarts because they are stored in MongoDB.
2. **Realtime fanout.** A committed durable change is delivered to connected participants without requiring a reload.
3. **Membership-based authorization.** A user who is not a member cannot read a conversation, send into it, receive its room traffic, or send typing state into it.
4. **Concurrent safety.** Shared-state mutations use database uniqueness constraints, conditional updates, and atomic array operators instead of an application-level lock.
5. **Multi-client coherence.** Every live socket for an account receives account-level changes, and every live socket for a conversation receives conversation-level changes. Client reducers are idempotent so optimistic writes and socket echoes converge.
6. **Recoverable disconnects.** Socket delivery is an acceleration path, not the storage layer. A reconnect causes the client to re-read durable state and close gaps created while it was offline.

Important invariants:


| Invariant                                                         | Enforcement                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Usernames are unique                                              | Mongoose unique index, with a pre-check for a friendly error                 |
| One friendship row exists per unordered user pair                 | Unique`pairKey` index                                                        |
| One DM exists per unordered participant pair                      | Unique partial`dmKey` index plus upsert                                      |
| A conversation read is scoped to membership                       | Query/update filters include`participants: userId`                           |
| A group-only mutation is scoped to a member of a group            | One conditional update includes`_id`, `participants`, and `isGroup`          |
| A group cannot exceed 100 members during member addition          | `$expr` size predicate is part of the update filter                          |
| Duplicate member additions do not duplicate array entries         | `$addToSet`                                                                  |
| A leave removes the caller from the participant array             | Atomic`$pull`                                                                |
| Message history is scoped to the requested conversation           | Every history query includes`conversationId` and membership is checked first |
| Conversation list activity does not move backwards                | Conditional pointer update requires`lastActivityAt < message.createdAt`      |
| A user is online if and only if at least one socket is registered | In-process`Map<string, Set<string>>`                                         |

## 3. High-level architecture

```text
┌────────────────────────────── Browser ──────────────────────────────┐
│ React/Vite SPA                                                     │
│  useAuth  │  REST API modules  │  useSocket  │  optimistic reducers │
└───────────────┬─────────────────────────────┬───────────────────────┘
                │ HTTPS/HTTP + httpOnly cookie │ Socket.IO handshake + events
                ▼                             ▼
┌────────────────────────────── Node process ─────────────────────────┐
│ Express application                                                  │
│  Helmet → JSON/cookie/CORS → Passport JWT → routes                  │
│  controllers → services → Mongoose models                           │
│                                                                      │
│ Socket.IO server on the same HTTP server                             │
│  cookie authentication → user rooms → conversation rooms             │
│  presence registry in process memory                                  │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ Mongoose
                               ▼
                        ┌──────────────┐
                        │   MongoDB    │
                        │ durable data │
                        └──────────────┘
```

### 3.1 Runtime components


| Component               | Implementation                            | Responsibility                                                                                                                     |
| ------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Browser UI              | React 19, Vite                            | Auth screens, inbox, friend requests, settings, responsive layout                                                                  |
| Browser HTTP client     | `client/src/api/*.js` and `api/client.js` | Sends JSON requests with`credentials: "include"`, unwraps response envelopes, normalizes avatars and populated objects             |
| Browser realtime client | `client/src/socket/useSocket.js`          | Creates one Socket.IO connection per signed-in browser instance, subscribes to events, reconnects automatically, emits typing only |
| HTTP API                | Express 5                                 | Authentication, reads, all durable writes, validation, error envelopes                                                             |
| Application services    | `server/src/services/*.ts`                | Business rules, membership checks, atomic MongoDB mutations, data shaping                                                          |
| Persistence             | Mongoose 8 and MongoDB                    | Durable documents, indexes, population, conditional updates                                                                        |
| Realtime transport      | Socket.IO 4                               | Authenticated rooms and event fanout; no durable event queue                                                                       |
| Presence                | `server/src/lib/presence.ts`              | Process-local socket counting and online/offline transitions                                                                       |

### 3.2 Server request pipeline

The server is assembled in `server/src/index.ts`:

1. Load environment variables.
2. Create the Express app.
3. Install Helmet, a 10 MB JSON body limit, cookie parsing, URL-encoded parsing, CORS restricted to `CLIENT_ORIGIN`, and Passport initialization.
4. Register `/health`.
5. Mount the authenticated and unauthenticated routes under `/api`.
6. Convert unknown routes to the standard not-found error.
7. Send all errors through one error handler.
8. Create one Node HTTP server, attach Socket.IO, connect to MongoDB, and only then call `listen`.

The route/controller/service separation keeps transport concerns out of business rules:

```text
HTTP request
  → route-level JWT middleware, where required
  → Zod schema parse in controller
  → service business rule and MongoDB operation
  → controller response and, for successful writes, socket fanout
  → shared error handler on failure
```

## 4. Data model and persistence

### 4.1 User

`server/src/models/user.model.ts`

```JSON
User {
  _id: ObjectId
  name: string                  // trimmed, 1–60 characters
  userName: string              // trimmed/lowercased, unique, 3–30 characters
  password: string              // bcrypt hash; removed by toJSON
  avatar: string | null         // validated http(s) URL or null
  createdAt: Date
  updatedAt: Date
}
```

Passwords are hashed by a Mongoose pre-save hook using `bcryptjs`. Login returns the same generic error for an unknown username and an incorrect password, avoiding a username enumeration signal. User JSON serialization removes `password`.

### 4.2 Conversation

`server/src/models/conversation.model.ts`

```text
Conversation {
  _id: ObjectId
  participants: ObjectId[]      // references User
  isGroup: boolean
  groupName: string | null
  dmKey: string | absent        // sorted pair key; DMs only
  createdBy: ObjectId
  lastMessage: ObjectId | null  // reference Message
  lastActivityAt: Date
  lastReadAt: Map<userId, Date>
  createdAt: Date
  updatedAt: Date
}
```

DMs have exactly two participants and `groupName: null`. Groups are created with the caller automatically included first. Duplicate requested IDs and the caller's own ID are collapsed before group creation; at least two other members must remain.

Indexes:

- unique partial `{ dmKey: 1 }` for documents whose `dmKey` is a string;
- `{ participants: 1, lastActivityAt: -1 }` for a user's ordered conversation list.

The list endpoint populates participants and the last message. `unreadCount` is computed per caller and is not persisted as a counter.

### 4.3 Message

`server/src/models/message.model.ts`

```text
Message {
  _id: ObjectId
  conversationId: ObjectId
  sender: ObjectId
  content: string              // trimmed, 1–4000 characters
  replyTo: ObjectId | null
  readBy: ObjectId[]
  createdAt: Date
  updatedAt: Date
}
```

Index: `{ conversationId: 1, _id: -1 }`. History uses `_id < cursor`, reads newest-first, and reverses each returned page to oldest-first for the client. The client can therefore prepend older pages without reordering the already-rendered thread.

Replies are validated against the same `conversationId`, so a message cannot quote content from another conversation.

### 4.4 Friendship

`server/src/models/friendship.model.ts`

```text
Friendship {
  _id: ObjectId
  requester: ObjectId
  recipient: ObjectId
  pairKey: string              // sorted requester/recipient IDs
  status: "pending" | "accepted"
  createdAt: Date
  updatedAt: Date
}
```

Indexes:

- unique `{ pairKey: 1 }`;
- `{ recipient: 1, status: 1 }` for incoming requests;
- `{ requester: 1, status: 1 }` for outgoing requests.

An accepted friendship is undirected for authorization, while a pending row preserves who requested whom. Sending a request to a user who already requested the caller conditionally changes the existing row to `accepted`.

### 4.5 Ephemeral server state


| State                             | Location                                    | Lifetime                    | Recovery                                      |
| ----------------------------------- | --------------------------------------------- | ----------------------------- | ----------------------------------------------- |
| Socket-to-user presence           | `socketsByUser` map                         | Node process lifetime       | Rebuilt from new handshakes                   |
| Socket.IO user/conversation rooms | Socket.IO adapter memory                    | Socket connection lifetime  | Rejoined from MongoDB on reconnect            |
| Typing state                      | Browser timers and Socket.IO event delivery | Short-lived; not persisted  | Disappears on timeout, disconnect, or refresh |
| Event delivery                    | Socket.IO connection                        | Best effort while connected | Durable state is re-read after reconnect      |

## 5. Authentication and authorization

### 5.1 Session lifecycle

Register and login both create an HS256 JWT containing `{ userId }`, audience `user`, and a seven-day expiry. The token is sent as:

```text
accessToken=<jwt>
httpOnly=true
secure=true in production, false in development
sameSite=none in production, lax in development
path=/
maxAge=7 days
```

The browser cannot inspect the cookie. On startup, `useAuth` calls `GET /api/auth/status`; the result determines whether the app renders the authenticated shell or the auth screen.

HTTP authentication uses Passport JWT with the cookie as the extractor. It verifies the signature, algorithm, audience, and user existence, then assigns the `UserDocument` to `req.user`.

Socket authentication repeats the same trust boundary. The handshake cookie parser correctly selects `accessToken` even when other cookies are present. The server verifies the token and confirms the user still exists before accepting the connection.

### 5.2 Authorization layers

Authorization is enforced in more than one place:

1. **Route middleware:** protects all user, friend, conversation, and message endpoints.
2. **Service query filters:** membership is carried into the MongoDB filter rather than checked in a separate read.
3. **Socket room ownership:** clients cannot request arbitrary conversation-room joins; rooms are derived from database membership by the server.
4. **Typing membership check:** every typing event validates the conversation ID and confirms membership before forwarding.
5. **Friendship gate:** DMs, group creation, and adding members require an accepted friendship with every target. Sending to a DM rechecks the friendship so an old DM becomes read-only after a friendship is removed.

For conversation and friendship records, an outsider generally receives the same `404` as a missing record. This prevents existence probing through a distinguishing `403` or detailed error.

## 6. HTTP API surface

Every JSON error is normalized by `errorHandler.middleware.ts`:

```json
{
  "message": "Validation failed",
  "errors": [{ "field": "password", "message": "Password must be at least 8 characters" }],
  "errorCode": "ERR_BAD_REQUEST"
}
```

Application errors use `ERR_BAD_REQUEST`, `ERR_UNAUTHORIZED`, `ERR_FORBIDDEN`, `ERR_NOT_FOUND`, `ERR_CONFLICT`, or `ERR_INTERNAL`. Zod validation strips unknown fields for the object schemas used by auth and conversations.

### 6.1 Endpoint groups


| Group         | Routes                                                                                                                                                                                | Durable behavior                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Auth          | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/status`                                                                                    | Creates/validates/clears session; logout closes this user's live sockets in the current process |
| Users         | `GET /api/users`                                                                                                                                                                      | Lists everyone except caller and decorates each record with process-local`isOnline`             |
| Conversations | `POST`, `GET`, `GET /:id`, `PATCH /:id`, `POST /:id/members`, `DELETE /:id/members/me`, `POST /:id/read`                                                                              | Creates, reads, renames, expands, leaves, and marks conversations read                          |
| Messages      | `GET /api/conversations/:id/messages`, `POST /api/conversations/:id/messages`                                                                                                         | Cursor-paged history and durable message creation                                               |
| Friends       | `GET /api/friends`, `GET /api/friends/requests`, `POST /api/friends/requests`, `POST /api/friends/requests/:id/accept`, `DELETE /api/friends/requests/:id`, `DELETE /api/friends/:id` | Lists and mutates pending or accepted friendship rows                                           |

### 6.2 Resource limits


| Resource            | Current limit/behavior                                                     |
| --------------------- | ---------------------------------------------------------------------------- |
| JSON request body   | 10 MB Express parser limit                                                 |
| Display name        | 1–60 characters                                                           |
| Username            | 3–30 characters;`[a-z0-9._-]+` after trim/lowercase                       |
| Password            | 8–72 characters                                                           |
| Message             | 1–4000 characters after trim                                              |
| History page        | Default 30, caller may request 1–100                                      |
| Add-members request | 1–50 IDs before service-level de-duplication                              |
| Group membership    | Maximum 100 enforced during member addition                                |
| Session             | Seven days                                                                 |
| Socket rooms        | One user room plus one conversation room per current membership per socket |

The group size limit is enforced for additions, but the current group-creation service does not apply the same `MAX_GROUP_MEMBERS` check to a very large initial participant list. This should be closed before treating the limit as a universal invariant.

## 7. Realtime protocol and room topology

HTTP owns all durable reads and writes. Socket.IO carries fanout and the two ephemeral typing commands.

### 7.1 Rooms

```text
user:<userId>
  all sockets for one signed-in user, across browser tabs

conversation:<conversationId>
  all sockets whose authenticated user is currently a participant
```

On connection, the server:

1. registers the socket in the presence map;
2. emits `presence:online` only when this is the user's first socket;
3. emits authoritative `presence:sync` to the connecting socket;
4. joins `user:<userId>`;
5. queries current conversation IDs and joins all matching conversation rooms;
6. installs typing handlers and disconnect cleanup.

Clients do not join conversation rooms themselves. This prevents a client from subscribing to a conversation merely by guessing its ID.

### 7.2 Server-to-client events


| Event                  | Destination                | Payload                                | Meaning                                                        |
| ------------------------ | ---------------------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| `presence:sync`        | Connecting socket          | `{ userIds }`                          | Authoritative online-user snapshot                             |
| `presence:online`      | All other sockets          | `{ userId }`                           | User's first live socket connected                             |
| `presence:offline`     | All other sockets          | `{ userId }`                           | User's last live socket disconnected                           |
| `message:new`          | Conversation room          | `{ message }`                          | A message was stored and its populated form is available       |
| `conversation:new`     | Each member's user room    | `{ conversation }`                     | Conversation created or caller was added                       |
| `conversation:updated` | Conversation room          | `{ conversation }`                     | Group renamed or participant list changed                      |
| `conversation:removed` | Leaver's user room         | `{ conversationId }`                   | Caller no longer participates                                  |
| `conversation:read`    | Conversation room          | `{ conversationId, readerId, readAt }` | Reader advanced their read watermark                           |
| `friendship:changed`   | Both users' user rooms     | `{}`                                   | Friend request/friendship state changed; clients refetch lists |
| `typing:start`         | Other conversation members | `{ conversationId, userId }`           | Ephemeral typing start                                         |
| `typing:stop`          | Other conversation members | `{ conversationId, userId }`           | Ephemeral typing stop                                          |

The sender receives `message:new` too. This is intentional: another tab for the sender must see the message, and the client uses the server message ID to reconcile an optimistic local copy.

### 7.3 Client-originated socket traffic

The only client-originated events are `typing:start` and `typing:stop`, each carrying `{ conversationId }`. The server validates the ID and checks membership before using `socket.to(...)` to forward to other members. Messages, conversation changes, reads, and friendship mutations always use HTTP, so they have an authoritative response and a durable write path.

## 8. End-to-end flows

### 8.1 Application boot

```text
Browser loads SPA
  → GET /api/auth/status
      ├─ 200: set user
      │    → fetch conversations, users, friends, requests in parallel
      │    → create one Socket.IO connection with credentials
      │    → receive presence:sync and room membership
      └─ 401: render sign-in/sign-up screen
```

The client does not render the authenticated shell until the status request finishes, avoiding a signed-out flash for a returning session.

### 8.2 Register or login

```text
Auth form
  → client validation
  → POST /api/auth/register or /api/auth/login
  → Zod validation
  → find/create user; bcrypt compare/hash
  → Set-Cookie: accessToken
  → client stores returned user in React state
  → socket handshake uses the same cookie
```

Client validation mirrors the server for fast feedback, but the server remains authoritative.

### 8.3 Opening or creating a conversation

For a DM, the client sends `{ isGroup: false, participantId }`. The service rejects self-DMs, verifies the target, verifies accepted friendship, computes sorted `dmKey`, and performs `findOneAndUpdate(..., { upsert: true, $setOnInsert: ... })`.

For a group, the client sends `{ isGroup: true, groupName, participants }`. The service collapses IDs, removes the caller, requires at least two other members, verifies all users and friendships, and creates one conversation document.

After a new conversation is created, the controller:

1. joins all live member sockets to the conversation room;
2. emits `conversation:new` to each member's user room;
3. returns the populated conversation.

If a DM already exists, the response is `200`, no duplicate is emitted, and both callers converge on the existing `_id`.

### 8.4 Sending a message

```text
Client composer
  → append local optimistic message with local-* ID
  → bump local sidebar preview
  → POST /api/conversations/:id/messages
      → validate content/replyToId
      → find conversation with participants: caller
      → for DM, recheck accepted friendship
      → if reply, verify reply belongs to this conversation
      → insert Message
      → guarded Conversation pointer update
  → populate sender/reply data
  → emit message:new to conversation room
  → return 201 with newMessage
  → client replaces optimistic item by ID or ignores duplicate socket echo
```

The message is delivered to all currently connected conversation members, including all sender tabs. The sidebar uses `lastActivityAt` to move the row forward and increments unread state only for other senders in inactive conversations. When the active conversation is visible, the client posts a read mark.

### 8.5 Reading and read receipts

Opening a conversation or receiving a message in the visible active conversation calls `POST /api/conversations/:id/read`.

The service captures `readAt = new Date()`, conditionally updates `lastReadAt.<userId>` on a member conversation, and adds the caller to `readBy` for other-sender messages with `createdAt <= readAt`. The controller emits `conversation:read` to the conversation room. The client uses the watermark to mark only messages reached by that reader and clears the reader's own unread count.

The list endpoint computes unread count as messages from other senders created after the caller's `lastReadAt`, defaulting to the Unix epoch when no mark exists.

### 8.6 Rename, add members, and leave

All three operations are group-only and require current membership.

- **Rename:** one conditional `$set` changes `groupName`. It does not modify `lastActivityAt`, so a rename does not reorder the inbox.
- **Add members:** verify users and friendships, then one conditional `$addToSet` with a group-size `$expr`. Existing members receive `conversation:updated`; new members' live sockets join the room and receive `conversation:new`.
- **Leave:** one conditional `$pull` removes the caller. The server removes every live socket for that user from the room before emitting updates. The leaver receives `conversation:removed` and can no longer read history. If no members remain, the group and its messages are deleted.

### 8.7 Reconnect and offline recovery

Socket.IO reconnects automatically. Each new server-side connection reauthenticates, rebuilds room membership from MongoDB, and emits a fresh `presence:sync`. On any connection after the initial one, the client:

- refetches the conversation list;
- refetches friendship/request data;
- clears loaded thread caches and typing state;
- increments a reload epoch so the active thread can be fetched again.

This design deliberately treats Socket.IO events as non-durable notifications. History and list APIs close gaps caused by a disconnected tab or a missed event.

## 9. Client state and consistency model

The main state container is `client/src/App.jsx`.


| State               | Shape                                                                 | Source of truth                                                |
| --------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Auth                | `user`, `booting`                                                     | `/api/auth/status`, register/login                             |
| Conversations       | array with populated participants/last message and local`unreadCount` | `/api/conversations` plus socket reducers                      |
| Active conversation | one ID or`null`                                                       | Local selection                                                |
| Threads             | map from conversation ID to`{ items, hasMore, nextCursor, loading }`  | Message history plus`message:new`                              |
| Presence            | `Set<userId>`                                                         | `/api/users` initial seed, then `presence:sync`/online/offline |
| Typing              | map from conversation ID to temporary user-ID sets                    | Socket events and 3.5-second client expiry                     |
| Friends/requests    | arrays                                                                | Friends endpoints and`friendship:changed` refetch              |

Reducer rules that make multiple sources converge:

- `putMessage` replaces by `_id`; a server echo cannot duplicate a message.
- A successful POST replaces the `local-*` optimistic item; a failed POST retains it as failed so user text is not silently lost.
- `applyMessageToList` only moves a row forward when the incoming timestamp is not older than the current activity timestamp.
- `replaceConversation` preserves local unread state and a populated last-message preview when a mutation response contains only a bare `lastMessage` reference.
- `upsertConversation` handles duplicate `conversation:new` notifications or an already-known DM.
- `conversation:updated` replaces in place and does not reorder because metadata changes are not message activity.
- `conversation:removed` deletes the row and thread cache; if active, it clears the selection.
- `presence:sync` replaces the set wholesale and is authoritative after reconnect.

## 10. Concurrency and consistency

### 10.1 Concurrency strategy

The server runs JavaScript callbacks on one Node event loop, but asynchronous requests can overlap while awaiting MongoDB. Therefore, the design does not rely on “the check happened earlier” in application memory. Authorization predicates and invariants are included in database operations where a race could matter.


| Race or shared state                                 | Current mechanism                                                     | Result                                                                                       |
| ------------------------------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Two clients open the same DM                         | Sorted`dmKey`, unique partial index, upsert with `$setOnInsert`       | One document; later response is an existing conversation                                     |
| Two users send friend requests simultaneously        | Sorted`pairKey`, unique index, upsert, then conditional accept        | One row; mutual request can become accepted                                                  |
| Two clients accept one request                       | `recipient` and `status: "pending"` in the update filter              | Only the first matching update succeeds                                                      |
| Two clients add the same member                      | `$addToSet`                                                           | No duplicate array entry; operation is idempotent                                            |
| Two clients leave the same group                     | `$pull` with membership in the filter                                 | At most one call removes the member; a later call gets a not-found-style result              |
| A member adds while another member adds near the cap | `$expr` size condition in the same update as `$addToSet`              | The database decides whether the write matches; no read-then-write cap race                  |
| Two messages update the sidebar pointer              | `$lt` guard on `lastActivityAt`                                       | An older completion cannot move the pointer backwards                                        |
| One account opens multiple tabs                      | Presence is a set of socket IDs; rooms use user ID                    | First socket announces online; last socket announces offline                                 |
| A user leaves while messages are emitted             | Database membership change and room removal occur before leave events | The leaver is removed from all live tabs before subsequent fanout in the normal request path |

### 10.2 Atomicity boundaries

The following operations are intentionally not one MongoDB transaction:

- message insert followed by conversation pointer update;
- mark-read conversation watermark update followed by message `readBy` updates;
- leave update followed by deletion of an empty conversation and its messages;
- database mutation followed by Socket.IO fanout.

The current design tolerates some partial outcomes because the durable message/history documents are authoritative and the client can refetch. It does not provide exactly-once side effects or a durable event outbox.

Known consequences:

- A message can be stored even if the later pointer update or socket emit fails; history remains the recovery path.
- A successful durable mutation can be committed while a disconnected client misses the event; reconnect refetch is required.
- Empty-group deletion is implemented as a follow-up `Promise.all`; a process failure between operations can leave temporary orphaned data.
- The strict `lastActivityAt < message.createdAt` guard protects monotonicity, but messages created in the exact same millisecond can tie. In that edge case the pointer may not advance even though the message exists in history.

### 10.3 Idempotency

Idempotency is provided for selected operations:

- opening a DM is idempotent by `dmKey`;
- adding existing members is idempotent by `$addToSet`;
- a client message reducer is idempotent by server `_id`.

Sending a message has no client-supplied idempotency key. A client retry after an uncertain network failure can therefore create duplicate messages. This is a priority hardening item if the client will retry writes automatically.

## 11. Multiple clients and multi-device behavior

### 11.1 Multiple tabs for one user

Each browser tab creates one Socket.IO connection after auth. All of those sockets:

- enter the same `user:<userId>` room;
- enter the same set of conversation rooms;
- count separately in the presence registry;
- receive account-level `conversation:new`, `conversation:removed`, and `friendship:changed` events;
- receive conversation-level messages, updates, and read receipts.

Presence transitions are per user, not per tab. Closing one of two tabs does not emit offline. Closing the last tab does.

When one tab sends a message, that tab may see the optimistic message, the POST response, and the socket echo. The local ID replacement and server-ID de-duplication make the final thread contain exactly one durable message. Other tabs receive only the socket copy and update their own thread/sidebar state.

### 11.2 Multiple users in one conversation

Each member's sockets share `conversation:<conversationId>`. A message is therefore fanned out to every connected tab of every current member. A user not present in `participants` never joins that room through the normal server path and receives no room traffic.

When a member is added, all of that user's currently connected sockets are moved into the conversation room through the user's room. When a member leaves, all of that user's sockets are removed together. This is why leaving one tab is not enough to revoke realtime access; room operations target the user room, not an individual socket ID.

### 11.3 Disconnects and stale clients

Socket.IO reconnects a temporary network loss. The new handshake is authoritative for auth and membership, and the client performs HTTP refetches for durable projections. If the JWT is expired or the account no longer exists, the handshake fails with `Unauthorized` and the client signs out.

The server does not maintain a cross-process presence or event history. A process restart drops all sockets and presence entries; clients must reconnect and rebuild state.

## 12. Resource allocation and capacity

### 12.1 Allocation model

There is no queue, worker pool, cache, or explicit per-user rate limiter in the current implementation. Resources are allocated as follows:


| Resource              | Allocation model                                                                   | Main pressure point                                       |
| ----------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Node request handling | Event-loop callbacks; database and socket operations are awaited                   | Slow MongoDB queries and high concurrent connection count |
| MongoDB connections   | Mongoose driver's connection pool                                                  | Concurrent HTTP/socket membership lookups                 |
| Socket connection     | One Socket.IO socket per signed-in browser instance                                | Tabs/devices and reconnect storms                         |
| Room membership       | Socket.IO adapter memory; one user room plus all conversation rooms per socket     | Large memberships multiplied by number of sockets         |
| Presence              | One set entry per active socket                                                    | Process memory and multi-process inconsistency            |
| Conversation list     | One list query plus one unread count query per conversation (`Promise.all`)        | N+1 count workload for users with many conversations      |
| Message history       | At most 100 messages returned per request, indexed cursor                          | Deep history requires repeated page requests              |
| Browser threads       | Only opened/fetched conversations are kept in React state; reconnect clears caches | Memory for a large active thread or many fetched threads  |
| Typing                | Event forwarding plus short client timers; no persistence                          | High-frequency unthrottled typing events                  |

### 12.2 Complexity and scaling observations

- Conversation listing is indexed by participant/activity, but unread counts currently run one `countDocuments` per returned conversation. An aggregation or materialized unread counter will be preferable for large inboxes.
- Message history is designed for indexed cursor pagination rather than offset scans.
- Each socket joins every conversation at connect time, so connect cost grows with the user's membership count. This is deliberate: it ensures the user receives sidebar updates for conversations they are not currently viewing.
- Socket fanout is room-based, so a message costs a broadcast to current room members rather than an HTTP request per member.
- Presence operations are O(1) average for add/remove/lookup, but the `presence:sync` payload is O(number of online users).
- There is no backpressure or per-event rate limit. A production deployment should throttle typing and message requests and enforce operational quotas.

### 12.3 Horizontal scaling boundary

The current realtime design is single-process:

- presence is process-local;
- Socket.IO rooms are process-local with the default adapter;
- `disconnectUser` only reaches sockets attached to the current process;
- HTTP requests can reach a different process from a user's socket.

To scale across processes or hosts, add a shared Socket.IO adapter (normally Redis), move presence to a shared store with expiry/heartbeats, use a shared invalidation/event channel, and configure load balancing for the WebSocket transport. MongoDB remains the durable source of truth.

## 13. Failure modes and recovery


| Failure                         | Server behavior                                                                        | Client/recovery behavior                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Invalid or missing HTTP cookie  | `401 ERR_UNAUTHORIZED` before handler                                                  | Auth screen or request-level error                                 |
| Invalid/expired socket cookie   | Handshake rejected as`Unauthorized`                                                    | `useSocket` invokes `signOut`                                      |
| Database unavailable at startup | Connection error logged; process exits                                                 | Deployment supervisor must restart/fail readiness                  |
| Database error during request   | Shared`500 ERR_INTERNAL` envelope                                                      | Caller can retry, but message writes are not idempotent            |
| Socket disconnect while online  | Socket removed; offline event only on last socket                                      | Socket.IO reconnects; client refetches durable state               |
| Client misses a realtime event  | Event is not replayed                                                                  | Reconnect/list/thread HTTP fetch reconstructs current state        |
| Optimistic message POST fails   | Local item remains with failed state; sidebar preview is restored if applicable        | User can choose how to retry; no automatic idempotent retry exists |
| User leaves group               | DB membership removed, all user's room memberships removed,`conversation:removed` sent | Client removes conversation and active thread immediately          |
| Last member leaves group        | Group and messages are deleted by follow-up operations                                 | No member remains to receive updates; history becomes unavailable  |
| Unknown route                   | Standard`404 ERR_NOT_FOUND`                                                            | Client sees API error message                                      |

`GET /health` currently reports process health only; it does not run a MongoDB readiness query. Production orchestration should add a readiness endpoint that checks the database and a liveness endpoint that does not.

## 14. Security and privacy posture

Implemented protections:

- `httpOnly` session cookie prevents normal client JavaScript access to the JWT;
- secure cookie mode is enabled in production;
- CORS is restricted to configured `CLIENT_ORIGIN` and credentials are required;
- JWT algorithm and audience are constrained;
- password hashes use bcrypt and are not serialized;
- Zod validates object IDs, content lengths, URLs, usernames, and group names;
- membership predicates are included in conversation and message queries;
- outsiders receive indistinguishable not-found responses for protected resources;
- Helmet is enabled for HTTP security headers;
- clients cannot self-join arbitrary conversation rooms.

Production hardening still needed:

- add rate limiting and abuse detection for auth, messages, friend requests, and typing;
- add CSRF protection for cookie-authenticated state-changing HTTP routes, especially when using `SameSite=None`;
- require HTTPS everywhere in production and protect/rotate `JWT_SECRET`;
- add token revocation or session records if logout must invalidate stolen tokens immediately; current JWT logout clears the browser cookie and closes current-process sockets but does not revoke an already copied token;
- add audit/security logging without logging credentials or message content;
- consider content moderation, retention, and deletion policies before production use;
- decide whether an external avatar URL policy is sufficient for the product's privacy model.

End-to-end encryption is explicitly not part of this design. MongoDB and the server can read message content.

## 15. Testing strategy and matrix

### 15.1 Test layers


| Layer                 | Location                                                      | Purpose                                                                                                                     |
| ----------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Client pure logic     | `client/tests/conversation.test.js`, `authValidation.test.js` | Conversation presentation rules, optimistic reconciliation, pagination, unread/read reducers, validation                    |
| Client API contract   | `client/tests/authApi.test.js`, `friendsApi.test.js`          | Cookie credentials, request shapes, response unwrapping, error envelope mapping                                             |
| Server schema/service | `server/tests/*.test.ts`                                      | Business rules, validation, authorization filters, index-oriented concurrency design, message paging                        |
| Server controller     | `auth.controller.test.ts`, `conversation.controller.test.ts`  | HTTP status codes, validation routing, response envelopes, socket side-effect boundaries                                    |
| Presence unit         | `presence.test.ts`                                            | First/last socket transitions, duplicate/unknown socket handling                                                            |
| Socket integration    | `socket.test.ts`                                              | Handshake auth, room membership, multi-tab presence, typing isolation, leave revocation, outsider isolation, logout closure |
| Build/static checks   | package scripts                                               | TypeScript, ESLint, Vite bundle, formatting                                                                                 |
| Manual/E2E            | Not automated in repository                                   | Two-browser product flows, screenshots, visual and deployment verification                                                  |

### 15.2 Coverage matrix


| Area                       | Representative guarantees                                                                     | Automated tests                            | Current status        |
| ---------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------- |
| Auth validation            | Username normalization, password bounds, avatar scheme, form error mapping                    | Client`authValidation`; server `auth.test` | Passing               |
| Auth service/controller    | Hashing, login failure indistinguishability, 201/200/401/409 mapping                          | `auth.test`, `auth.controller.test`        | Passing               |
| User directory             | Excludes caller and password; maps online flag                                                | `user.test`                                | Passing               |
| DM creation                | Self-DM rejection, friendship gate, stable`dmKey`, upsert/idempotence                         | `conversation.test`, controller tests      | Passing               |
| Group creation             | Caller inclusion, de-duplication, minimum size, existence/friendship checks                   | `conversation.test`                        | Passing               |
| Conversation reads         | Membership filters, ordered list, unread count, read watermark                                | `conversation.test`, controller tests      | Passing               |
| Membership mutations       | Atomic leave, DM rejection, 100-member cap predicate,`$addToSet`, rename semantics            | `membership.test`                          | Passing               |
| Friend requests            | Pair uniqueness, mutual-request acceptance, recipient-only accept, privacy-preserving 404     | `friend.test`                              | Passing               |
| Message writes             | Validation, membership/friendship, reply scope, guarded activity pointer, fanout participants | `message.test`                             | Passing               |
| Message history            | Indexed cursor shape, oldest-first page,`hasMore`, strict backwards cursor                    | `message.test`                             | Passing               |
| Client message consistency | Optimistic replacement, socket echo de-duplication, stale event ordering                      | `conversation.test.js`                     | Passing               |
| Presence                   | First/last socket semantics and socket-set integrity                                          | `presence.test`                            | Passing               |
| Socket authentication      | Missing/bad cookies rejected                                                                  | `socket.test`                              | Passing               |
| Socket rooms               | Auto-join from DB, outsider isolation, no client join escalation                              | `socket.test`                              | Passing               |
| Multi-tab realtime         | Own echo, room delivery, leave removes every tab                                              | `socket.test`, client reducers             | Passing               |
| Typing                     | Other members receive; sender/non-member do not                                               | `socket.test`                              | Passing               |
| Reconnect recovery         | Client code path exists and refetches; no automated browser test                              | `useSocket.js`, `App.jsx`                  | Partial               |
| Full browser E2E           | Register → friend → conversation → message → leave across real browsers                   | No E2E suite                               | Not implemented       |
| Manual test evidence       | Executed matrix and screenshots                                                               | No recorded artifact found                 | Not executed/recorded |

### 15.3 Verification snapshot

The repository was inspected and checked on 2026-09-21:

- client tests: **33 passing** when each test file is executed directly;
- server tests: **108 passing** when each TypeScript test file is executed directly with `ts-node/register`;
- client production build: **passing**;
- server TypeScript build: **passing**;
- server typecheck, including test typecheck: **passing**;
- server ESLint: **passing**;
- server Prettier check: **failing** because the repository currently reports formatting issues in 46 files;
- aggregate `node --test` commands: blocked in this restricted environment by Node test-runner child-process `spawn EPERM`; this did not reproduce when the same test files were run directly.

The automated suite is strong on service invariants and Socket.IO authorization. It does not replace a real browser E2E run against MongoDB and the built client.

### 15.4 Recommended manual matrix

The following should be executed in two or more real browser sessions and recorded with results and screenshots:


| ID  | Scenario                                                | Expected result                                                                         |
| ----- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| M1  | Register A and B; log in from two browsers              | Both sessions enter the inbox and show presence                                         |
| M2  | Send a friend request, accept it                        | Both friend lists update; request badge clears                                          |
| M3  | Open the same DM from both clients                      | One conversation ID exists; second open is idempotent                                   |
| M4  | Send while both are viewing the DM                      | Both see one message without refresh; sidebars update                                   |
| M5  | Send while recipient views another conversation         | Recipient receives sidebar preview and unread count                                     |
| M6  | Open the unread conversation                            | Count clears locally and through`conversation:read`; read receipt appears               |
| M7  | Create a group with A, B, and C                         | All members receive the group row and room traffic                                      |
| M8  | Rename the group                                        | All members see the new name; row does not jump due only to rename                      |
| M9  | Add a member who is not an accepted friend              | Request is rejected and no room membership is granted                                   |
| M10 | Add an accepted friend                                  | New member sees`conversation:new` and receives subsequent messages without reconnecting |
| M11 | Have A leave while B sends                              | A receives no new message, unread badge, or sidebar movement; history API returns 404   |
| M12 | Open two tabs for one account; close one then the other | No offline event after first close; offline only after last close                       |
| M13 | Disable network, send/reconnect, then restore           | Socket reconnects and list/active history reconstruct current durable state             |
| M14 | Log out with two tabs open                              | Both sockets close and later conversation events do not arrive                          |
| M15 | Attempt outsider HTTP and Socket.IO access              | History/read/message/typing are denied; outsider receives no room events                |

## 16. Operations and deployment

### 16.1 Required configuration

The server requires:

```text
NODE_ENV=development|production
PORT=8000                         # default 8000
MONGODB_URI=<mongodb connection string>
JWT_SECRET=<strong secret>
CLIENT_ORIGIN=http://localhost:5100 # default in development
```

The Vite client uses `VITE_API_URL` when provided and otherwise `http://localhost:8000`. The Vite development server is fixed to port `5100`, matching the default server CORS origin.

### 16.2 Local commands

```bash
# client
cd client
npm install
npm run dev
npm test
npm run build

# server
cd server
npm install
npm run dev
npm test
npm run typecheck
npm run build
npm run lint
npm run format:check
```

The server starts only after MongoDB connection succeeds. `nodemon` watches `server/src` and runs `ts-node` in development. Production runs the compiled `dist/index.js`.

### 16.3 Observability currently available

Current logs include startup/database failures, non-5xx application errors through the error handler, unhandled server errors, and failures while joining conversation rooms or forwarding typing. There is no structured logger, request ID, metrics, tracing, durable audit log, or event delivery metric yet.

For production operations, add:

- structured logs with request/socket/user correlation IDs;
- MongoDB query latency and pool metrics;
- active sockets, rooms, reconnects, and presence transition metrics;
- message send success/failure and event fanout metrics;
- readiness checks and deployment health probes;
- alerting for database errors, reconnect storms, and elevated unauthorized traffic.
