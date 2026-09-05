import "./helpers/env";
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import { AddressInfo } from "net";
import { io as connect, Socket as ClientSocket } from "socket.io-client";
import ConversationModel from "../src/models/conversation.model";
import UserModel from "../src/models/user.model";
import {
  closeSocket,
  emitToConversation,
  initializeSocket,
  leaveConversationRoom,
  readCookie,
  SOCKET_EVENTS,
} from "../src/lib/socket";
import { resetPresence } from "../src/lib/presence";
import { COOKIE_NAME, setJwtAuthCookie } from "../src/utils/cookie";
import { queryStub } from "./helpers/mongoose";

const ALICE = "507f1f77bcf86cd799439012";
const BOB = "507f1f77bcf86cd799439013";
const CONVERSATION_ID = "507f1f77bcf86cd7994390ff";

/** setJwtAuthCookie writes onto a Response; borrow it so tests mint real tokens. */
const tokenFor = (userId: string) => {
  let cookie = "";
  setJwtAuthCookie({
    res: {
      cookie: (_name: string, value: string) => {
        cookie = value;
      },
    } as never,
    userId,
  });
  return cookie;
};

/** Both users exist, and both belong to the one conversation. */
const stubDatabase = () => {
  mock.method(UserModel, "findById", ((id: string) =>
    Promise.resolve({ _id: id })) as never);
  mock.method(ConversationModel, "find", (() =>
    queryStub([{ _id: CONVERSATION_ID }])) as never);
};

type Harness = {
  server: http.Server;
  url: string;
  clients: ClientSocket[];
};

const startServer = async (): Promise<Harness> => {
  const server = http.createServer();
  initializeSocket(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}`, clients: [] };
};

const stopServer = async (harness: Harness) => {
  for (const client of harness.clients) client.close();
  await closeSocket();
  await new Promise<void>((resolve) => harness.server.close(() => resolve()));
  resetPresence();
  mock.restoreAll();
};

const connectAs = (harness: Harness, userId: string) => {
  const client = connect(harness.url, {
    transports: ["websocket"],
    extraHeaders: {
      // a second cookie is present on purpose: splitting the whole header on
      // "=" and taking index 1 picks up "dark; accessToken" instead of the token
      cookie: `theme=dark; ${COOKIE_NAME}=${tokenFor(userId)}`,
    },
  });
  harness.clients.push(client);
  return client;
};

const once = <T>(client: ClientSocket, event: string, ms = 2000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for ${event}`)),
      ms,
    );
    client.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

/** Resolves to false if the event does NOT arrive, which is the assertion. */
const silentFor = (client: ClientSocket, event: string, ms = 300) =>
  new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(true), ms);
    client.once(event, () => {
      clearTimeout(timer);
      resolve(false);
    });
  });

test("the cookie header parser picks the right cookie", () => {
  assert.equal(readCookie(`${COOKIE_NAME}=abc`, COOKIE_NAME), "abc");
  assert.equal(readCookie(`theme=dark; ${COOKIE_NAME}=abc`, COOKIE_NAME), "abc");
  assert.equal(readCookie(`${COOKIE_NAME}=abc; theme=dark`, COOKIE_NAME), "abc");
  assert.equal(readCookie("theme=dark", COOKIE_NAME), null);
  assert.equal(readCookie(undefined, COOKIE_NAME), null);
});

test("a connection without a valid session is refused", async (t) => {
  const harness = await startServer();
  stubDatabase();
  t.after(() => stopServer(harness));

  const noCookie = connect(harness.url, { transports: ["websocket"] });
  harness.clients.push(noCookie);
  const failure = await once<Error>(noCookie, "connect_error");
  assert.match(failure.message, /Unauthorized/);

  const badToken = connect(harness.url, {
    transports: ["websocket"],
    extraHeaders: { cookie: `${COOKIE_NAME}=not-a-jwt` },
  });
  harness.clients.push(badToken);
  const rejected = await once<Error>(badToken, "connect_error");
  // a malformed token is a client problem; it used to be reported as a 500
  assert.match(rejected.message, /Unauthorized/);
});

test("connecting reports who is already online", async (t) => {
  const harness = await startServer();
  stubDatabase();
  t.after(() => stopServer(harness));

  const alice = connectAs(harness, ALICE);
  const sync = await once<{ userIds: string[] }>(alice, SOCKET_EVENTS.PRESENCE_SYNC);
  assert.deepEqual(sync.userIds, [ALICE]);

  const online = once<{ userId: string }>(alice, SOCKET_EVENTS.PRESENCE_ONLINE);
  connectAs(harness, BOB);
  assert.equal((await online).userId, BOB);
});

test("a user's last socket closing is what marks them offline", async (t) => {
  const harness = await startServer();
  stubDatabase();
  t.after(() => stopServer(harness));

  const alice = connectAs(harness, ALICE);
  await once(alice, SOCKET_EVENTS.PRESENCE_SYNC);

  const bobTab1 = connectAs(harness, BOB);
  await once(alice, SOCKET_EVENTS.PRESENCE_ONLINE);
  const bobTab2 = connectAs(harness, BOB);
  await once(bobTab2, SOCKET_EVENTS.PRESENCE_SYNC);

  bobTab2.close();
  // one tab of two closing must not sign the user out
  assert.equal(await silentFor(alice, SOCKET_EVENTS.PRESENCE_OFFLINE), true);

  const offline = once<{ userId: string }>(alice, SOCKET_EVENTS.PRESENCE_OFFLINE);
  bobTab1.close();
  assert.equal((await offline).userId, BOB);
});

test("connecting joins every conversation the user belongs to", async (t) => {
  const harness = await startServer();
  stubDatabase();
  t.after(() => stopServer(harness));

  const alice = connectAs(harness, ALICE);
  await once(alice, SOCKET_EVENTS.PRESENCE_SYNC);
  const bob = connectAs(harness, BOB);
  await once(bob, SOCKET_EVENTS.PRESENCE_SYNC);

  const delivered = once<{ message: { content: string } }>(
    bob,
    SOCKET_EVENTS.MESSAGE_NEW,
  );
  // no client-side join was ever sent; the server put them in the room
  emitToConversation(CONVERSATION_ID, SOCKET_EVENTS.MESSAGE_NEW, {
    message: { content: "hello" },
  });

  assert.equal((await delivered).message.content, "hello");
});

test("the sender's own sockets receive the message too", async (t) => {
  const harness = await startServer();
  stubDatabase();
  t.after(() => stopServer(harness));

  const aliceTab1 = connectAs(harness, ALICE);
  await once(aliceTab1, SOCKET_EVENTS.PRESENCE_SYNC);
  const aliceTab2 = connectAs(harness, ALICE);
  await once(aliceTab2, SOCKET_EVENTS.PRESENCE_SYNC);

  const onTab2 = once(aliceTab2, SOCKET_EVENTS.MESSAGE_NEW);
  emitToConversation(CONVERSATION_ID, SOCKET_EVENTS.MESSAGE_NEW, {
    message: { content: "from my other tab" },
  });

  // excluding one socket id would have left this tab out; the client settles
  // its optimistic copy by message id instead
  await onTab2;
});

test("a user who leaves a group stops receiving its messages immediately", async (t) => {
  const harness = await startServer();
  stubDatabase();
  t.after(() => stopServer(harness));

  const alice = connectAs(harness, ALICE);
  await once(alice, SOCKET_EVENTS.PRESENCE_SYNC);
  const bob = connectAs(harness, BOB);
  await once(bob, SOCKET_EVENTS.PRESENCE_SYNC);

  // both are in the room to begin with
  const before = once(bob, SOCKET_EVENTS.MESSAGE_NEW);
  emitToConversation(CONVERSATION_ID, SOCKET_EVENTS.MESSAGE_NEW, {
    message: { content: "still a member" },
  });
  await before;

  leaveConversationRoom(BOB, CONVERSATION_ID);

  const stillDelivered = once(alice, SOCKET_EVENTS.MESSAGE_NEW);
  const bobStaysQuiet = silentFor(bob, SOCKET_EVENTS.MESSAGE_NEW);
  emitToConversation(CONVERSATION_ID, SOCKET_EVENTS.MESSAGE_NEW, {
    message: { content: "after leaving" },
  });

  await stillDelivered;
  // no reconnect, no refresh: the room membership changed inside the request
  assert.equal(await bobStaysQuiet, true, "the leaver must receive nothing");
});

test("leaving takes every tab out of the room, not just one", async (t) => {
  const harness = await startServer();
  stubDatabase();
  t.after(() => stopServer(harness));

  const bobTab1 = connectAs(harness, BOB);
  await once(bobTab1, SOCKET_EVENTS.PRESENCE_SYNC);
  const bobTab2 = connectAs(harness, BOB);
  await once(bobTab2, SOCKET_EVENTS.PRESENCE_SYNC);

  leaveConversationRoom(BOB, CONVERSATION_ID);

  const tab1Quiet = silentFor(bobTab1, SOCKET_EVENTS.MESSAGE_NEW);
  const tab2Quiet = silentFor(bobTab2, SOCKET_EVENTS.MESSAGE_NEW);
  emitToConversation(CONVERSATION_ID, SOCKET_EVENTS.MESSAGE_NEW, {
    message: { content: "after leaving" },
  });

  assert.deepEqual([await tab1Quiet, await tab2Quiet], [true, true]);
});
