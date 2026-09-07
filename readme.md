# Named-chat

We’re making a text based, instant messaging and web based system where two or more users can have one-to-one or group conversation. Users can see the online/offline status of other users and participate in multiple conversations.

## Goals

- Instant messaging: sending and receiving messages should be eventful and requires no action from the receiver.
- It must be concurrent which doesn’t lose updates, duplicate records, get into locked or torn state when simulations users send message. Each mutation of the shared state should be atomic and protected by db invariant.
- One user is simultaneously a live participant in N conversations while viewing one, and every one of the N updates its sidebar entry in real time.
- Persistent membership and conversation lifecycle and storage, actions as creating, joining, leaving, adding members and messages sent across all chats should be persistent changes unless deleted by the user.
- It should have good ui/ux
- code should be maintained, documented, modular and well organized.
- Should have a unit test suite and manual tests(to check actual functionality and flows).

## Core User Flow

1. User signs up (unique user name and password) or signs in.

   > Server sets a session cookie; the client opens the WebSocket
   > carrying the same cookie and is registered as online.
   >
2. User opens the chat and sees their conversation list, ordered by
   most recent activity, and which users are currently online.
3. User starts a new conversation: pick one person for a DM, or create a group
   and pick two or more people.
4. User opens a conversation, reads its history, and sends a message; other
   participants receive it live.
5. User renames a group, adds members, or leaves a conversation; every other
   participant sees the change live.
6. User signs out; other users see them go offline.

## Features

- Identity and session: supporting sign up, sign in and sign out. Unique id keyed on username, online and offline indicator, profile mgmt.
- one-to-one or group chats with their attached func.
- Instant and optimistic messaging.

## Scope

### In Scope

- Client and server.
- Persistent WebSocket transport plus an HTTP API for writes and reads.
- Authentication, authorization, and per-conversation membership enforcement.
- Concurrency strategy.
- Automated tests (unit, integration, socket, concurrency, component, E2E)
  and an executed manual test matrix.
- UI/UX sketches with written commentary on the hierarchy decisions.

### Out Of Scope

- Voice and video calls
- End-to-end encryption.
- Message search across conversations.
- Federation, multi-tenancy, or mobile native clients.
- File and image attachments

## Success Criteria

- Two browsers, two accounts: A sends, B sees the message in an open
  conversation with no reload; both sidebars reorder.
- A third user who is not a participant cannot read the conversation's
  history over HTTP and cannot receive its live traffic over the socket
  both refused, and both covered by a test.
- A user who leaves a group stops receiving its messages immediately,
  without refreshing, and cannot re-read it.
- The whole test suite runs from one command with no GUI and no external
  service; concurrency tests fail if their fix is reverted.
- The manual test matrix is executed and recorded with results and
  screenshots, not just designed.
