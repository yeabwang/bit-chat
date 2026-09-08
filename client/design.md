# Bit-chat UI Design Notes

This document describes the current React + Vite frontend prototype based on the supplied Figma draft. It records the visual hierarchy and responsive decisions rather than describing a completed messaging backend.

The project root is the repository's `client/` folder. The current design remains frontend-only and is implemented under `src/`.

## Information Architecture

```text
client/
├── index.html
├── package.json
├── package-lock.json
├── readme.md
├── design.md
└── src/
    ├── App.jsx
    ├── main.jsx
    ├── components/
    │   ├── Avatar/
    │   ├── Button/
    │   ├── ConversationItem/
    │   ├── Icon/
    │   ├── Image/
    │   ├── Input/
    │   ├── MessageBubble/
    │   ├── Modal/
    │   ├── SearchBar/
    │   ├── Sidebar/
    │   └── common.css
    ├── pages/
    │   ├── Friends/
    │   ├── Inbox/
    │   ├── Login/
    │   ├── Settings/
    │   └── Signup/
    ├── layouts/AppLayout/
    ├── data/
    └── styles/
        ├── global.css
        ├── responsive.css
        └── variables.css
```

Reusable controls and visual primitives are isolated in `components/`. The `pages/` directory owns screen-level composition and page-specific styles. `AppLayout` provides the authenticated shell and sidebar placement, while `App.jsx` controls the current screen and UI state.

## Visual Hierarchy

- The sidebar provides primary navigation, theme switching, help, settings, and logout actions.
- The conversation list is a scanning surface: search, online contacts, previews, timestamps, unread counts, and selected state appear in that order.
- The chat panel gives the active conversation the largest area, with identity and actions in the header, messages in the center, and the composer anchored at the bottom.
- Friend requests and settings use centered cards in the content area so they remain readable at wide viewport sizes.
- Authentication uses a focused card over a full-screen image background and keeps the form width constrained on smaller screens.
- Modal dialogs sit above the app with a dimmed backdrop and preserve the current screen underneath.

## Responsive Behavior

- Desktop: sidebar, conversation list, and chat panel appear as three columns.
- Medium screens: sidebar and conversation list contract while the chat panel retains the remaining width.
- Small screens: the app changes to a single-column layout and switches between the conversation list and active chat view instead of squeezing three columns together.
- Friends and settings cards span the available content area and remain horizontally centered.
- Authentication cards use fluid sizing and become nearly full-width on phones.
- Content panels use scrolling within their available height so the composer and navigation remain usable.

## State And Data

The prototype uses React state for authentication mode, selected conversation, search text, theme, modal visibility, and mobile view. `src/data/mockData.js` supplies contacts, messages, and settings rows. `src/data/assets.js` supplies the visual assets used by the prototype.

There is currently no persistence, authentication service, HTTP API, WebSocket transport, or real-time presence system. Those integrations should be added behind the existing page and component boundaries rather than directly inside presentational primitives.

## Run

```bash
npm install
npm run dev
```

Use `npm run build` to verify the production bundle before integrating future data services.

