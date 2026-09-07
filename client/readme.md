# Named-chat

Named-chat is a React and Vite frontend prototype for a text-based messaging application. The UI supports sign up/sign in states, an inbox with conversations, group chat presentation, friend requests, settings, modal flows, online indicators, and a responsive mobile layout.

The root `client/` folder is reserved for the future backend. It does not contain a running client yet.

The current repository is frontend-only. Conversation data, authentication, and actions are represented with local mock data and UI state; there is no client, database, HTTP API, or WebSocket connection yet.

## Getting Started

Requirements: Node.js and npm.

```bash
npm install
npm run dev
```

Vite prints the local development URL, normally `http://localhost:5173/`.

Create a production bundle with:

```bash
npm run build
```

Preview the production bundle with:

```bash
npm run preview
```

## Current UI

- Sign up and sign in presentation with a switch between the two modes.
- Responsive inbox with a sidebar, conversation list, search field, online avatars, and chat panel.
- Message history presentation with text and image messages.
- New-message and new-group modal flows.
- Friend request and settings pages.
- Light/dark theme toggle in the sidebar.
- Desktop, medium-width, and mobile layouts.

## Project Structure

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
    │   ├── Avatar/Avatar.jsx
    │   ├── Button/Button.jsx
    │   ├── ConversationItem/ConversationItem.jsx
    │   ├── Icon/Icon.jsx
    │   ├── Image/Img.jsx
    │   ├── Input/Input.jsx
    │   ├── MessageBubble/MessageBubble.jsx
    │   ├── Modal/
    │   │   ├── Modal.jsx
    │   │   └── modal.css
    │   ├── SearchBar/SearchBar.jsx
    │   ├── Sidebar/
    │   │   ├── Sidebar.jsx
    │   │   └── sidebar.css
    │   └── common.css
    ├── pages/
    │   ├── Friends/
    │   │   ├── FriendsScreen.jsx
    │   │   └── friends.css
    │   ├── Inbox/
    │   │   ├── ChatPanel.jsx
    │   │   ├── ConversationList.jsx
    │   │   └── inbox.css
    │   ├── Login/Login.jsx
    │   ├── Settings/
    │   │   ├── SettingsScreen.jsx
    │   │   └── settings.css
    │   └── Signup/
    │       ├── AuthScreen.jsx
    │       ├── Signup.jsx
    │       └── auth.css
    ├── layouts/AppLayout/AppLayout.jsx
    ├── data/
    │   ├── assets.js
    │   └── mockData.js
    └── styles/
        ├── global.css
        ├── responsive.css
        └── variables.css
```
# Named-chat

The application has moved into the [`client/`](client/) folder.

Run it from the client directory:

```bash
cd client
npm install
npm run dev
```

See [client/readme.md](client/readme.md) for the frontend architecture, UI scope, and build commands. See [client/design.md](client/design.md) for the design and responsive behavior notes.