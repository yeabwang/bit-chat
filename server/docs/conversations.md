# Conversations API

Base URL (dev): `http://localhost:8000`
All conversation routes are mounted under `/api/conversations`.

| Method | Path                     | Auth required | Purpose                               |
| ------ | ------------------------ | ------------- | ------------------------------------- |
| POST   | `/api/conversations`     | yes           | Open a DM, or create a group          |
| GET    | `/api/conversations`     | yes           | List the caller's conversations       |
| GET    | `/api/conversations/:id` | yes           | Read one conversation and its history |

Requests and responses are `application/json`. Every route sits behind the session cookie described in [`auth`](./auth.md); a missing or invalid cookie is `401 Not authenticated` before the handler runs.

---

## The conversation object

| Field            | Notes                                                   |
| ---------------- | ------------------------------------------------------- |
| `participants`   | always populated, contains`name`, `userName`, `avatar`  |
| `isGroup`        | `false` for a DM, `true` for a group                    |
| `groupName`      | `null` on DMs.                                          |
| `lastActivityAt` | the ordering key for the sidebar.                       |
| `dmKey`          | sorted participant pair that keeps DMs unique           |

---

## POST /api/conversations

One endpoint, two body shapes. `isGroup` is **required** - it is the field that
says which shape you are sending.

### Open a direct message

```json
{
  "isGroup": false,
  "participantId": "507f1f77bcf86cd799439012"
}
```

| Field           | Required | Rules                        |
| --------------- | -------- | ---------------------------- |
| `isGroup`       | yes      | `false`                      |
| `participantId` | yes      | a 24 character hex object id |

This endpoint is idempotent for a pair of users: calling it twice returns the same conversation. The second call answers `200`, not `201`. Concurrent calls also converge on one conversation - see [Concurrency](#concurrency).

## The response object

```json
{
  "message": "Conversation created",
  "conversation": {
    "_id": "6a97db32a2b4a0d3c06fdd3e",
    "dmKey": "6a96d943c9e433d4bf56f83c:6a97d982f2e2a731973f333a",
    "__v": 0,
    "createdAt": "2026-09-02T08:15:44.813Z",
    "createdBy": "6a96d943c9e433d4bf56f83c",
    "groupName": null,
    "isGroup": false,
    "lastActivityAt": "2026-09-02T08:15:44.819Z",
    "lastMessage": null,
    "participants": [
      {
        "_id": "6a96d943c9e433d4bf56f83c",
        "name": "Yeabsira Tesfaye",
        "userName": "yeabwang",
        "avatar": "https://avatars.githubusercontent.com/u/122813658?s=400&u=adc7b4ccbf5a80ead19ab9251a0f9631f1109bec&v=4"
      },
      {
        "_id": "6a97d982f2e2a731973f333a",
        "name": "Jade",
        "userName": "jade",
        "avatar": "https://avatars.githubusercontent.com/u/218497123?v=4"
      }
    ],
    "updatedAt": "2026-09-02T08:15:44.813Z"
  }
}
```

### Create a group

```json
{
  "isGroup": true,
  "groupName": "Study group",
  "participants": ["507f1f77bcf86cd799439012", "507f1f77bcf86cd799439013"]
}
```

| Field          | Required | Rules                                                |
| -------------- | -------- | ---------------------------------------------------- |
| `isGroup`      | yes      | `true`                                               |
| `groupName`    | yes      | trimmed, 1-60 characters                             |
| `participants` | yes      | at least two object ids, **not counting the caller** |

The caller is added to `participants` automatically and always ends up first. Duplicate ids are collapsed, and the caller's own id is stripped if it was sent, so `[jade, jade, vagif, me]` becomes `[me, jade, vagif]`. The length check runs **after** that collapse, so `[jade, me]` is rejected because a two person group is a DM.

Fields belonging to the other shape are stripped, not rejected.

## The response object

```json
{
  "message": "Conversation created",
  "conversation": {
    "participants": [
      {
        "_id": "6a96d943c9e433d4bf56f83c",
        "name": "Yeabsira Tesfaye",
        "userName": "yeabwang",
        "avatar": "https://avatars.githubusercontent.com/u/122813658?s=400&u=adc7b4ccbf5a80ead19ab9251a0f9631f1109bec&v=4"
      },
      {
        "_id": "6a97d982f2e2a731973f333a",
        "name": "Jade",
        "userName": "jade",
        "avatar": "https://avatars.githubusercontent.com/u/218497123?v=4"
      },
      {
        "_id": "6a97d99ff2e2a731973f333d",
        "name": "Tony",
        "userName": "tony",
        "avatar": "https://avatars.githubusercontent.com/u/173241359?v=4"
      },
      {
        "_id": "6a97d9bef2e2a731973f3340",
        "name": "Vagif",
        "userName": "vagif",
        "avatar": "https://avatars.githubusercontent.com/u/79749801?v=4"
      }
    ],
    "isGroup": true,
    "groupName": "Coding group",
    "createdBy": "6a96d943c9e433d4bf56f83c",
    "lastMessage": null,
    "_id": "6a97dcf5f2e2a731973f3353",
    "lastActivityAt": "2026-09-02T08:23:17.430Z",
    "createdAt": "2026-09-02T08:23:17.431Z",
    "updatedAt": "2026-09-02T08:23:17.431Z",
    "__v": 0
  }
}
```

### Responses

| Status | When                                        | Body                                                                            |
| ------ | ------------------------------------------- | ------------------------------------------------------------------------------- |
| `201`  | A new DM or group was created               | `{ "message": "Conversation created", "conversation": { ... } }`                |
| `200`  | The DM already existed                      | `{ "message": "Conversation already exists", "conversation": { ... } }`         |
| `400`  | Body failed validation                      | validation error envelope                                                       |
| `400`  | `participantId` is the caller               | `{ "message": "You cannot start a conversation with yourself", ... }`           |
| `400`  | A group came down to fewer than two members | `{ "message": "A group needs at least two other members", ... }`                |
| `401`  | No session                                  | `{ "message": "Not authenticated", "errorCode": "ERR_UNAUTHORIZED" }`           |
| `404`  | A named participant does not exist          | `{ "message": "One or more users do not exist", "errorCode": "ERR_NOT_FOUND" }` |

---

## GET /api/conversations

No request body. Returns every conversation the caller participates in, newest activity first.

Ordered by `lastActivityAt` descending.

| Status | When       |
| ------ | ---------- |
| `200`  | Always     |
| `401`  | No session |

An empty list is `200` with `"conversations": []`.

## The response object

```json
{
  "message": "Conversations retrieved successfully",
  "conversations": [
    {
      "_id": "6a97dcf5f2e2a731973f3353",
      "participants": [
        {
          "_id": "6a96d943c9e433d4bf56f83c",
          "name": "Yeabsira Tesfaye",
          "userName": "yeabwang",
          "avatar": "https://avatars.githubusercontent.com/u/122813658?s=400&u=adc7b4ccbf5a80ead19ab9251a0f9631f1109bec&v=4"
        },
        {
          "_id": "6a97d982f2e2a731973f333a",
          "name": "Jade",
          "userName": "jade",
          "avatar": "https://avatars.githubusercontent.com/u/218497123?v=4"
        },
        {
          "_id": "6a97d99ff2e2a731973f333d",
          "name": "Tony",
          "userName": "tony",
          "avatar": "https://avatars.githubusercontent.com/u/173241359?v=4"
        },
        {
          "_id": "6a97d9bef2e2a731973f3340",
          "name": "Vagif",
          "userName": "vagif",
          "avatar": "https://avatars.githubusercontent.com/u/79749801?v=4"
        }
      ],
      "isGroup": true,
      "groupName": "Coding group",
      "createdBy": "6a96d943c9e433d4bf56f83c",
      "lastMessage": null,
      "lastActivityAt": "2026-09-02T08:23:17.430Z",
      "createdAt": "2026-09-02T08:23:17.431Z",
      "updatedAt": "2026-09-02T08:23:17.431Z",
      "__v": 0
    },
    {
      "_id": "6a97db32a2b4a0d3c06fdd3e",
      "dmKey": "6a96d943c9e433d4bf56f83c:6a97d982f2e2a731973f333a",
      "__v": 0,
      "createdAt": "2026-09-02T08:15:44.813Z",
      "createdBy": "6a96d943c9e433d4bf56f83c",
      "groupName": null,
      "isGroup": false,
      "lastActivityAt": "2026-09-02T08:15:44.819Z",
      "lastMessage": null,
      "participants": [
        {
          "_id": "6a96d943c9e433d4bf56f83c",
          "name": "Yeabsira Tesfaye",
          "userName": "yeabwang",
          "avatar": "https://avatars.githubusercontent.com/u/122813658?s=400&u=adc7b4ccbf5a80ead19ab9251a0f9631f1109bec&v=4"
        },
        {
          "_id": "6a97d982f2e2a731973f333a",
          "name": "Jade",
          "userName": "jade",
          "avatar": "https://avatars.githubusercontent.com/u/218497123?v=4"
        }
      ],
      "updatedAt": "2026-09-02T08:28:59.344Z"
    }
  ]
}
```

---

## GET /api/conversations/:id

No request body. `:id` is a conversation id and must be a 24 character hex object id; anything else is a `400` for failling validation

`messages` is ordered oldest first, so the client can append and scroll to the bottom. `replyTo`, when set, is populated with `content`, `image` and its own `sender`.

| Status | When                                          | Body                                                                   |
| ------ | --------------------------------------------- | ---------------------------------------------------------------------- |
| `200`  | The caller is a participant                   | as above                                                               |
| `400`  | `:id` is not an object id                     | validation error envelope                                              |
| `401`  | No session                                    | `{ "message": "Not authenticated", ... }`                              |
| `404`  | No such conversation,**or** not a participant | `{ "message": "Conversation not found or you are not a participant" }` |

Both cases answer `404` with the same message on purpose. A `403` would tell a stranger that the conversation exists.

## The response object

```json
{
  "message": "Conversation retrieved successfully",
  "conversation": {
    "_id": "6a97db32a2b4a0d3c06fdd3e",
    "dmKey": "6a96d943c9e433d4bf56f83c:6a97d982f2e2a731973f333a",
    "__v": 0,
    "createdAt": "2026-09-02T08:15:44.813Z",
    "createdBy": "6a96d943c9e433d4bf56f83c",
    "groupName": null,
    "isGroup": false,
    "lastActivityAt": "2026-09-02T08:15:44.819Z",
    "lastMessage": null,
    "participants": [
      {
        "_id": "6a96d943c9e433d4bf56f83c",
        "name": "Yeabsira Tesfaye",
        "userName": "yeabwang",
        "avatar": "https://avatars.githubusercontent.com/u/122813658?s=400&u=adc7b4ccbf5a80ead19ab9251a0f9631f1109bec&v=4"
      },
      {
        "_id": "6a97d982f2e2a731973f333a",
        "name": "Jade",
        "userName": "jade",
        "avatar": "https://avatars.githubusercontent.com/u/218497123?v=4"
      }
    ],
    "updatedAt": "2026-09-02T08:28:59.344Z"
  },
  "messages": []
}
```

---

## Concurrency

To address the case where two users creating conversation at same instant, we store a`dmKey` and sort both participants ids and join with `:` under a unique partial index:

```js
conversationSchema.index(
  { dmKey: 1 },
  { unique: true, partialFilterExpression: { dmKey: { $type: "string" } } },
);
```

Creation is a single `findOneAndUpdate` with `upsert: true` and `$setOnInsert`. Whichever request lands second matches the existing document instead of inserting, and its response is `200` rather than `201`.

---

## Error envelopes

Identical to [`auth`](./auth.md#error-envelopes) - every error goes through the same handler.

---

## Walkthrough

Sign in first (see `auth`); every step below sends the session cookie.

1. **List users** - `GET /api/users`. Note two ids other than your own.
2. **Open a DM** - `POST /api/conversations` with `{"isGroup": false, "participantId": "<first id>"}`. Expect `201` and a conversation whose `participants` holds two populated users.
3. **Open the same DM again** - resend step 2. Expect `200`, message `"Conversation already exists"`, and the _same_ `_id`.
4. **DM yourself** - resend step 2 with your own id. Expect `400`.
5. **Create a group** - `POST /api/conversations` with `{"isGroup": true, "groupName": "Coding group", "participants": [<both ids>]}`. Expect `201`, three participants, you first.
6. **Too small to form a group** - repeat step 5 with `"participants": [<first id>]`. Expect `400`.
7. **Unknown member** - repeat step 5 with `"participants": ["507f1f77bcf86cd7994390aa", <first id>]`. Expect `404`.
8. **Empty body** - `POST /api/conversations` with `{}`. Expect `400`.
9. **List** - `GET /api/conversations`. Expect both conversations, the group first because it was created last.
10. **Read one** - `GET /api/conversations/<group id>`. Expect `200`, `"messages": []`.
11. **Read a stranger's** - sign in as a third account not in that group and repeat step 10. Expect `404`.
12. **Malformed id** - `GET /api/conversations/not-an-id`. Expect `400`.
