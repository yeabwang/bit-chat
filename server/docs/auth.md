# Auth API

Base URL (dev): `http://localhost:8000`
All auth routes are mounted under `/api/auth`.

| Method | Path                 | Auth required | Purpose                       |
| ------ | -------------------- | ------------- | ----------------------------- |
| POST   | `/api/auth/register` | no            | Create an account and sign in |
| POST   | `/api/auth/login`    | no            | Sign in                       |
| POST   | `/api/auth/logout`   | no            | Clear the session cookie      |
| GET    | `/api/auth/status`   | yes           | Return the signed-in user     |

Requests and responses are `application/json`.

---

## Session cookie

`register` and `login` both set the session cookie.

| Property   | Value                                        |
| ---------- | -------------------------------------------- |
| Name       | `accessToken`                                |
| Contents   | JWT, HS256,`{ userId }`, `aud: "user"`       |
| Lifetime   | 7 days - token and cookie expire together    |
| `httpOnly` | `true`                                       |
| `secure`   | `true` in production, `false` in development |
| `sameSite` | `none` in production, `lax` in development   |
| `path`     | `/`                                          |

Browser clients must send `credentials: "include"` on every request; the server's CORS is locked to `CLIENT_ORIGIN`.

---

## POST /api/auth/register

### Request

```json
{
  "name": "Yeabsira Tesfaye",
  "userName": "yeabwang",
  "password": "something",
  "avatar": "https://avatars.githubusercontent.com/u/122813658?v=4"
}
```

| Field      | Required | Rules                                                    |
| ---------- | -------- | -------------------------------------------------------- |
| `name`     | yes      | trimmed, 1–60 characters                                 |
| `userName` | yes      | trimmed,lowercased, 3–30 characters, only`a-z 0-9 . _ -` |
| `password` | yes      | 8–72 characters                                          |
| `avatar`   | no       | valid`http:`/`https:` URL; defaults to `null`            |

Unknown fields are stripped, not rejected.

## The response object

```json
{
  "message": "Account created",
  "user": {
    "name": "Yeabsira Tesfaye",
    "userName": "yeabwang",
    "avatar": "https://avatars.githubusercontent.com/u/122813658?s=400&u=adc7b4ccbf5a80ead19ab9251a0f9631f1109bec&v=4",
    "_id": "6a96d943c9e433d4bf56f83c",
    "createdAt": "2026-09-01T13:55:15.440Z",
    "updatedAt": "2026-09-01T13:55:15.440Z",
    "__v": 0
  }
}
```

### Responses

| Status | When                                                           | Body                                                                    |
| ------ | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `201`  | Account created                                                | `{ "message": "Account created", "user": { ... } }` + cookie            |
| `400`  | Body failed validation                                         | validation error envelope                                               |
| `409`  | `userName` is taken                                            | `{ "message": "Username already taken", "errorCode": "ERR_CONFLICT" }`  |
| `409`  | Two signups for the same name raced caught by the unique index | `{ "message": "Resource already exists", "errorCode": "ERR_CONFLICT" }` |
| `500`  | Anything else                                                  | internal error envelope (below)                                         |

---

## POST /api/auth/login

### Request

```json
{
  "userName": "yeabwang",
  "password": "something"
}
```

Same `userName` and `password` rules as `register`.

## The response object

```json
{
  "message": "Signed in",
  "user": {
    "_id": "6a96d943c9e433d4bf56f83c",
    "name": "Yeabsira Tesfaye",
    "userName": "yeabwang",
    "avatar": "https://avatars.githubusercontent.com/u/122813658?s=400&u=adc7b4ccbf5a80ead19ab9251a0f9631f1109bec&v=4",
    "createdAt": "2026-09-01T13:55:15.440Z",
    "updatedAt": "2026-09-01T13:55:15.440Z",
    "__v": 0
  }
}
```

### Responses

| Status | When                                  | Body                                                                             |
| ------ | ------------------------------------- | -------------------------------------------------------------------------------- |
| `200`  | Credentials accepted                  | `{ "message": "Signed in", "user": { ... } }` + cookie                           |
| `400`  | Body failed validation                | validation error envelope                                                        |
| `401`  | Wrong password**or** unknown username | `{ "message": "Invalid username or password", "errorCode": "ERR_UNAUTHORIZED" }` |

---

## POST /api/auth/logout

No request body. Clears the `accessToken` cookie, and closes the socket connections belonging to that session. Succeeds whether or not a session was present.

## The response object

```json
{
  "message": "Signed out"
}
```

| Status | Body                          |
| ------ | ----------------------------- |
| `200`  | `{ "message": "Signed out" }` |

---

## GET /api/auth/status

No request body. Reads the `accessToken` cookie.

## The response object

```json
{
  "message": "Authenticated user",
  "user": {
    "_id": "6a96d943c9e433d4bf56f83c",
    "name": "Yeabsira Tesfaye",
    "userName": "yeabwang",
    "avatar": "https://avatars.githubusercontent.com/u/122813658?s=400&u=adc7b4ccbf5a80ead19ab9251a0f9631f1109bec&v=4",
    "createdAt": "2026-09-01T13:55:15.440Z",
    "updatedAt": "2026-09-01T13:55:15.440Z",
    "__v": 0
  }
}
```

| Status | When                                                           | Body                                                                  |
| ------ | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| `200`  | Valid session                                                  | `{ "message": "Authenticated user", "user": { ... } }`                |
| `401`  | Cookie missing, invalid, expired, or the user no longer exists | `{ "message": "Not authenticated", "errorCode": "ERR_UNAUTHORIZED" }` |

Use this on client startup to restore a session - the cookie is `httpOnly`, so the browser cannot inspect it directly.

---

## Unknown routes

Anything not matched under `/api` answers `404` through the same envelope.

```json
{ "message": "Route not found", "errorCode": "ERR_NOT_FOUND" }
```

---

## Error envelopes

Every error goes through one handler, so the shape is consistent.

**Validation (`400`)** - one entry per failed field:

```json
{
  "message": "Validation failed",
  "errors": [
    { "field": "password", "message": "Password must be at least 8 characters" },
    { "field": "userName", "message": "Username must be at least 3 characters" }
  ],
  "errorCode": "ERR_BAD_REQUEST"
}
```

**Application errors (`401`, `404`, `409`)**:

```json
{ "message": "Username already taken", "errorCode": "ERR_CONFLICT" }
```

**Unhandled (`500`)**:

```json
{
  "message": "Internal Server Error",
  "error": "…",
  "errorCode": "ERR_INTERNAL"
}
```

Error codes in use: `ERR_BAD_REQUEST`, `ERR_UNAUTHORIZED`, `ERR_FORBIDDEN`, `ERR_NOT_FOUND`, `ERR_CONFLICT`, `ERR_INTERNAL`.

---

### Walkthrough

1. **Register** - `POST /api/auth/register` with the body above. Expect `201`, a `user` with no `password`, and `Set-Cookie: accessToken=…` in the response headers.
2. **Check the session** - `GET /api/auth/status`. Expect `200` and the same user. This proves the cookie round-tripped.
3. **Register the same username again** - resend step 1. Expect `409`.
4. **Log out** - `POST /api/auth/logout`. Expect `200`. Then `GET /api/auth/status` again: expect `401`.
5. **Log in** - `POST /api/auth/login` with `userName` and `password`. Expect `200` and a fresh cookie.
6. **Wrong password** - repeat step 5 with a bad password. Expect `401`.
7. **Unknown username** - repeat step 5 with a username that does not exist. Expect `401` with the _same_ message as step 6, not a `404`.
8. **Bad input** - `POST /api/auth/login` with `{"userName":"ab","password":"x"}`. Expect `400` and one `errors` entry per broken rule.
