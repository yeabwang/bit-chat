# Messages API

Base URL (dev): `http://localhost:8000`
Messages are nested under the conversation they belong to.

| Method | Path                              | Auth required | Purpose                |
| ------ | --------------------------------- | ------------- | ---------------------- |
| POST   | `/api/conversations/:id/messages` | yes           | Send a message         |
| GET    | `/api/conversations/:id/messages` | yes           | Read history, one page |

Requests and responses are `application/json`. Both routes sit behind the session cookie described in [`auth`](./auth.md); a missing or invalid cookie is `401 Not authenticated` before the handler runs.

---

## The message object

```json
{
  "_id": "6a97e0a1f2e2a731973f3361",
  "conversationId": "6a97dcf5f2e2a731973f3353",
  "sender": {
    "_id": "6a97d982f2e2a731973f333a",
    "name": "Jade",
    "userName": "jade",
    "avatar": "https://avatars.githubusercontent.com/u/218497123?v=4"
  },
  "content": "Meeting at 5",
  "replyTo": null,
  "createdAt": "2026-09-05T10:00:00.000Z",
  "updatedAt": "2026-09-05T10:00:00.000Z",
  "__v": 0
}
```

| Field            | Notes                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| `conversationId` | the thread this belongs to                                            |
| `sender`         | populated with`name`, `userName`, `avatar`                            |
| `content`        | 1-4000 characters, trimmed. Always present                            |
| `replyTo`        | `null`, or the quoted message with its `content` and its own `sender` |

---

## POST /api/conversations/:id/messages

```json
{
  "content": "Meeting at 5",
  "replyToId": "6a97e0a1f2e2a731973f3360"
}
```

| Field       | Required | Rules                                               |
| ----------- | -------- | --------------------------------------------------- |
| `content`   | yes      | trimmed, 1-4000 characters                          |
| `replyToId` | no       | object id of a message**in this same conversation** |

A whitespace-only `content` is rejected: it trims to the empty string and fails the minimum length.

`replyToId` is looked up scoped to the conversation, so a reply cannot quote a message from a thread the sender is not entitled to read.

### Response

```json
{
  "message": "Message sent",
  "newMessage": { "...": "message object" }
}
```

| Status | When                                          | Body                                                                   |
| ------ | --------------------------------------------- | ---------------------------------------------------------------------- |
| `201`  | Sent                                          | as above                                                               |
| `400`  | Body or`:id` failed validation                | validation error envelope                                              |
| `401`  | No session                                    | `{ "message": "Not authenticated", ... }`                              |
| `404`  | No such conversation,**or** not a participant | `{ "message": "Conversation not found or you are not a participant" }` |
| `404`  | `replyToId` is not in this conversation       | `{ "message": "Reply message not found" }`                             |

A successful send emits `message:new` to everyone in the conversation, including the sender's own tabs - see [`protocol`](./protocol.md).

---

## GET /api/conversations/:id/messages

Returns one page of history, newest messages last.

| Query    | Required | Rules                                                       |
| -------- | -------- | ----------------------------------------------------------- |
| `limit`  | no       | 1-100, default 30                                           |
| `cursor` | no       | `nextCursor` from a previous page. Omit for the newest page |

```json
{
  "message": "Messages retrieved successfully",
  "items": [{ "...": "message object" }],
  "hasMore": true,
  "nextCursor": "6a97e0a1f2e2a731973f3355"
}
```

| Field        | Notes                                                                               |
| ------------ | ----------------------------------------------------------------------------------- |
| `items`      | **oldest first**, so a page can be prepended as-is                                  |
| `hasMore`    | whether older messages exist beyond this page                                       |
| `nextCursor` | pass as`cursor` to fetch the page before this one. `null` when `hasMore` is `false` |

| Status | When                                          | Body                                                                   |
| ------ | --------------------------------------------- | ---------------------------------------------------------------------- |
| `200`  | The caller is a participant                   | as above                                                               |
| `400`  | `:id`, `limit` or `cursor` failed validation  | validation error envelope                                              |
| `401`  | No session                                    | `{ "message": "Not authenticated", ... }`                              |
| `404`  | No such conversation,**or** not a participant | `{ "message": "Conversation not found or you are not a participant" }` |

A conversation with no messages is `200` with `"items": []`, `"hasMore": false`, `"nextCursor": null`.

### Infinite scroll

1. Open the conversation: `GET /api/conversations/:id/messages`. Render `items` as-is.
2. Scrolled to the top and `hasMore` is `true`: `GET /api/conversations/:id/messages?cursor=<nextCursor>`.
3. Prepend the new `items` ahead of what you already have. Repeat until `hasMore` is `false`.

## Error envelopes

Identical to [`auth`](./auth.md#error-envelopes) - every error goes through the same handler.

---

## Walkthrough

Sign in and create a group first (see [`conversations`](./conversations.md)).

1. **Empty history** - `GET /api/conversations/<id>/messages`. Expect `200`, `"items": []`, `"hasMore": false`, `"nextCursor": null`.
2. **Send** - `POST /api/conversations/<id>/messages` with `{"content": "Meeting at 5"}`. Expect `201` and a `newMessage` with a populated `sender`.
3. **Blank message** - resend step 2 with `{"content": "   "}`. Expect `400`.
4. **Sidebar moved** - `GET /api/conversations`. Expect this conversation first, with `lastMessage` populated.
5. **Reply** - resend step 2 with `replyToId` set to the id from step 2. Expect `201` and a populated `replyTo`.
6. **Reply across threads** - resend step 5 against a _different_ conversation id. Expect `404`.
7. **Page** - send about 40 messages, then `GET /api/conversations/<id>/messages?limit=10`. Expect 10 items oldest-first, `hasMore: true`, and a `nextCursor`.
8. **Page back** - repeat with `?limit=10&cursor=<nextCursor>`. Expect the ten before those, with no repeats and no gaps.
9. **Walk to the end** - keep paging until `hasMore` is `false`. Expect `nextCursor: null`.
10. **Bad paging** - `?limit=0` and `?limit=1000` and `?cursor=nope`. Expect `400` for each.
11. **Not a member** - sign in as an account outside the conversation and repeat steps 1 and 2. Expect `404` for both.
