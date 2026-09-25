# Friends API

Base URL (dev): `http://localhost:8000`
All friend routes are mounted under `/api/friends`.

| Method | Path                               | Auth required | Purpose                          |
| ------ | ---------------------------------- | ------------- | -------------------------------- |
| GET    | `/api/friends`                     | yes           | List the caller's friends        |
| DELETE | `/api/friends/:id`                 | yes           | Remove a friend                  |
| GET    | `/api/friends/requests`            | yes           | List pending requests, both ways |
| POST   | `/api/friends/requests`            | yes           | Send a friend request            |
| POST   | `/api/friends/requests/:id/accept` | yes           | Accept an incoming request       |
| DELETE | `/api/friends/requests/:id`        | yes           | Decline or withdraw a request    |

Requests and responses are `application/json`. Every route sits behind the session cookie described in [`auth`](./auth.md); a missing or invalid cookie is `401 Not authenticated` before the handler runs.

---

## The friendship object

One document represents a pair in either state. There is no `declined` state: a
declined request is deleted.

| Field       | Notes                                          |
| ----------- | ---------------------------------------------- |
| `requester` | who sent the request                           |
| `recipient` | who received it                                |
| `pairKey`   | sorted id pair, unique, keeps one row per pair |
| `status`    | `pending` or `accepted`                        |
| `createdAt` | when the request was sent                      |
| `updatedAt` | when it was accepted                           |

### The pair key

A friendship has no direction once accepted, but a request does. Two rows, one
per direction, could disagree with each other, and nothing would stop A and B
from each holding a pending request to the other.

Instead the two ids are sorted and joined into `pairKey`, which carries a unique
index. One row per pair, whoever asked first. Same idea as `dmKey` on the
conversation.

---

## POST /api/friends/requests

```json
{
  "userId": "507f1f77bcf86cd799439012"
}
```

| Field    | Required | Rules                        |
| -------- | -------- | ---------------------------- |
| `userId` | yes      | a 24 character hex object id |

| Status | Meaning                                            |
| ------ | -------------------------------------------------- |
| `201`  | Request created, now pending                       |
| `200`  | They had already asked you, so you are now friends |
| `400`  | Yourself, already friends, or already sent         |
| `404`  | No such user                                       |

```json
{
  "message": "Friend request sent",
  "data": { "_id": "...", "status": "pending" }
}
```

---

## POST /api/friends/requests/:id/accept

Only the recipient of a still-pending request can accept it. Both conditions sit
in the filter of the update that performs the write, so there is no window
between checking and writing, and two taps cannot both succeed.

| Status | Meaning                                                |
| ------ | ------------------------------------------------------ |
| `200`  | Accepted                                               |
| `400`  | Already accepted, or the caller is the one who sent it |
| `404`  | No such request, or it belongs to two other people     |

A caller who is not part of the request gets the same `404` as one using an id
that does not exist. Distinguishing them would let anyone probe ids to learn who
has sent requests to whom.

---

## DELETE /api/friends/requests/:id

Declining an incoming request and withdrawing one you sent are the same
operation: delete the pending row. Either party may do it.

The row is removed rather than marked declined, which frees the unique pair key
so the two can try again later.

---

## GET /api/friends/requests

```json
{
  "message": "Friend requests fetched",
  "incoming": [
    { "_id": "...", "user": { "name": "Alice", "userName": "alice", "avatar": null } }
  ],
  "outgoing": []
}
```

Each row is `{ _id, user }`, where `user` is the other person. The client renders
the counterpart, never the raw requester/recipient pair.

---

## GET /api/friends

Accepted friendships, most recently accepted first, in the same `{ _id, user }`
shape.

## DELETE /api/friends/:id

Removes an accepted friendship. Either party may do it.

---

## Concurrency

### Two people adding each other at the same moment

A check followed by an insert would let both requests see an empty collection and
both write, and the unique index would then reject one of them with a raw
duplicate key error.

The service upserts on `pairKey` instead. The database serialises the two
attempts: one inserts, the other matches the row that was just written and gets
it back. The loser then sees a pending request addressed to itself, which is
consent from both sides, so it flips the status to `accepted` rather than
erroring. Two people asking each other simultaneously become friends, which is
also what a user would expect.

That accept is itself a conditional update filtered on `status: "pending"`, so a
concurrent accept through another path cannot be overwritten.

### Guarantees and their tests

| Guarantee                                     | Mechanism                                |
| --------------------------------------------- | ---------------------------------------- |
| One row per pair                              | unique index on `pairKey`                |
| Simultaneous mutual requests do not duplicate | upsert, then conditional accept          |
| A request cannot be accepted twice            | `status: "pending"` in the update filter |
| Only the recipient can accept                 | `recipient` in the update filter         |
| Non-participants learn nothing                | same `404` as a missing row              |

Each is covered in `tests/friend.test.ts`, which asserts on the filter passed to
Mongo rather than only the return value, so removing a condition fails a test.
