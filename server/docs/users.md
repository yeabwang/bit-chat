# Users API

Base URL (dev): `http://localhost:8000`
All user routes are mounted under `/api/users`.

| Method | Path         | Auth required | Purpose                         |
| ------ | ------------ | ------------- | ------------------------------- |
| GET    | `/api/users` | yes           | List everyone except the caller |

Requests and responses are `application/json`. The route sits behind the session cookie described in [`auth`](./auth.md); a missing or invalid cookie is `401 Not authenticated` before the handler runs.

---

## GET /api/users

No request body, no query parameters.

```json
{
  "message": "Users retrieved successfully",
  "users": [
    {
      "_id": "6a97d982f2e2a731973f333a",
      "name": "Jade",
      "userName": "jade",
      "avatar": "https://avatars.githubusercontent.com/u/218497123?v=4",
      "createdAt": "2026-09-02T08:08:34.921Z",
      "updatedAt": "2026-09-02T08:08:34.921Z",
      "__v": 0,
      "isOnline": true
    }
  ]
}
```

| Status | When       | Body                                                                  |
| ------ | ---------- | --------------------------------------------------------------------- |
| `200`  | Always     | `{ "message": "Users retrieved successfully", "users": [ ... ] }`     |
| `401`  | No session | `{ "message": "Not authenticated", "errorCode": "ERR_UNAUTHORIZED" }` |

A directory with no other accounts in it is `200` with `"users": []`.

### isOnline

`isOnline` is computed per request from the live socket table and not stored.

Use this endpoint for the initial state on page load, then keep it current from the `presence:online` and `presence:offline` socket events - see [`protocol`](./protocol.md). The socket also sends `presence:sync` on connect, which carries the same information; either is a valid starting point.

---

## Error envelopes

Identical to [`auth`](./auth.md#error-envelopes) - every error goes through the same handler.

---

## Walkthrough

1. **Register two accounts** - see the `auth` walkthrough. Stay signed in as the second.
2. **List** - `GET /api/users`. Expect `200`, the first account present, the second absent, and no `password` field on either.
3. **No session** - `POST /api/auth/logout`, then repeat step 2. Expect `401`.
