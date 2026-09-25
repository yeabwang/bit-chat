# Bit-chat UI Design Notes

Frontend-only React + Vite prototype built from the Figma draft. Records layout and data-shape decisions, not a
finished backend. Project root is the repository's `client/` folder.

## Information Architecture

```text
client/
├── index.html
├── package.json
├── package-lock.json
├── readme.md
├── design.md
├── tests/                  
│   ├── authValidation.test.js
│   └── conversation.test.js
└── src/
    ├── App.jsx                 current screen + UI state
    ├── main.jsx
    ├── assets/
    │   ├── logo.svg            traced crest
    │   └── logo-wordmark.svg   wordmark, currentColor silhouette
    ├── components/             reusable primitives
    │   ├── Avatar/
    │   ├── Icon/
    │   ├── Image/
    │   ├── Modal/
    │   ├── Sidebar/
    │   └── common.css
    ├── pages/                  screen composition + page styles
    │   ├── Friends/
    │   ├── Inbox/
    │   ├── Login/
    │   ├── Settings/
    │   └── Signup/
    ├── layouts/AppLayout/      authenticated shell, sidebar placement
    ├── data/
    └── styles/
        ├── global.css
        ├── responsive.css
        └── variables.css
```

## Visual Hierarchy

- **Sidebar** — brand lockup, then Inbox and Friend requests; Settings and Log out pinned to the bottom. Active row
  gets a fill *and* a left rail (alpha fill alone is weak on a saturated ground).
- **Conversation list** — search, online contacts, previews, timestamps, unread counts, selected state, in that
  order. New conversation is the pencil beside the "Inbox" heading, not a separate button.
- **Chat panel** — largest area. Identity and actions in the header, messages centre, composer anchored bottom.
- **Friends / Settings** — centred cards, readable at wide viewports.
- **Auth** — one centred card over a brand gradient of two opposing radial glows (a linear ramp between the theme
  colours passes through mud brown). Card order: logo, heading, lead, fields, primary action, mode switch. Green
  carries the action, red stays chrome. Under 480px the card becomes the page.
- **Modals** — dimmed backdrop, screen underneath preserved.

### Colour

All colour lives in `styles/variables.css`; no other source file holds a literal. Roles are not interchangeable:


| Token                                    | Role                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| `--sidebar-bg`                           | brand anchor                                                                   |
| `--accent`                               | interactive: buttons, own bubble, unread badge                                 |
| `--online`                               | presence only, never an action                                                 |
| `--accent-tint` / `--accent-tint-strong` | hover / selected rows                                                          |
| `--danger`                               | errors — a different red from`--brand-red`, so an error never reads as chrome |

Icon assets are flat Figma exports with a baked fill. `Icon` masks them over `currentColor`, so a glyph takes its
colour from context instead of shipping recoloured copies.

### Direct messages and groups

One server object covers both, flagged by `isGroup`. A DM has `groupName: null`, exactly two participants, and `400`
on rename / add-member / leave. Every branch is derived in `data/conversation.js`, keeping components presentational.


|                | DM                                    | Group                                         |
| ---------------- | --------------------------------------- | ----------------------------------------------- |
| Title          | other participant's`name`             | `groupName`                                   |
| Avatar         | other participant + presence dot      | two-up stack, no dot (presence is per person) |
| List preview   | the message                           | the message, sender-prefixed                  |
| Header detail  | `@userName` + online state            | member count, how many online                 |
| Header actions | none                                  | Add members, Rename, Leave                    |
| Messages       | no sender heading (header names them) | sender name + avatar per run                  |

Messages from one sender within five minutes collapse into a run — heading and avatar appear once per run.

## Responsive Behavior


| Width   | Layout                                                    |
| --------- | ----------------------------------------------------------- |
| Desktop | three columns: sidebar, conversation list, chat panel     |
| Medium  | sidebar and list contract, chat panel keeps the remainder |
| Small   | single column, toggling between list and active chat      |

Friends/settings cards span the content area and stay centred. Auth cards are fluid, near full-width on phones.
Content panels scroll inside their own height so the composer and nav stay reachable.

## State And Data

React state holds auth mode, conversation list, active conversation, search text, modal visibility, mobile view. No
persistence, HTTP client, WebSocket transport, or real presence yet.

`data/mockData.js` matches the API responses it stands in for:


| Mock export              | Endpoint                                              |
| -------------------------- | ------------------------------------------------------- |
| `users`                  | `GET /api/users`                                      |
| `conversations`          | `GET /api/conversations`, `lastActivityAt` descending |
| `messagesByConversation` | `GET /api/conversations/:id/messages`                 |

Wiring the server means swapping those imports for fetch calls — components consume the same fields either way.
`data/conversation.js` holds the DM-vs-group rules, covered by `tests/conversation.test.js` (`npm test`).

Auth posts the server's own field names — `{ name, userName, password }` to register, `{ userName, password }` to log
in. `pages/Signup/authValidation.js` mirrors the zod schema, so `400 { errors: [{ field, message }] }` maps onto the
form with no translation layer.

Invariants already shaped for the socket protocol:

- opening a thread clears its unread count
- a rename must not reorder the list (`conversation:updated` leaves the row in place)
- leaving drops the conversation
- a sent message is appended optimistically, reconciled by `_id` on `message:new`

### Friend requests

No endpoints behind this screen yet. Built against this shape so the server has a target:


| Method   | Path                       | Purpose                                 |
| ---------- | ---------------------------- | ----------------------------------------- |
| `GET`    | `/api/friend-requests`     | caller's incoming and outgoing requests |
| `POST`   | `/api/friend-requests`     | send one, by`userId`                    |
| `PATCH`  | `/api/friend-requests/:id` | accept or decline an incoming request   |
| `DELETE` | `/api/friend-requests/:id` | withdraw one you sent                   |

Until then it runs on `friendRequests` in `mockData.js`; accept/decline only updates local state.

## Run

```bash
npm install
npm run dev
```

`npm run build` verifies the production bundle.
