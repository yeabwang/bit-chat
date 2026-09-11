import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Login from "./pages/Login/Login";
import Signup from "./pages/Signup/Signup";
import ConversationList from "./pages/Inbox/ConversationList";
import ChatPanel from "./pages/Inbox/ChatPanel";
import FriendsScreen from "./pages/Friends/FriendsScreen";
import SettingsScreen from "./pages/Settings/SettingsScreen";
import Modal from "./components/Modal/Modal";
import AppLayout from "./layouts/AppLayout/AppLayout";
import { useAuth } from "./auth/useAuth";
import { useSocket } from "./socket/useSocket";
import {
  listConversations,
  createConversation,
  renameGroup as patchGroupName,
  addMembers as postMembers,
  leaveConversation,
  markRead,
  normalize as normalizeConversation,
} from "./api/conversations";
import { listUsers } from "./api/users";
import {
  listMessages,
  sendMessage as postMessage,
  normalize as normalizeMessage,
} from "./api/messages";
import { friendRequests } from "./data/friendRequests";
import {
  applyMessageToList,
  byActivity,
  EMPTY_THREAD,
  mergeOlderPage,
  putMessage,
  replaceConversation,
  upsertConversation,
} from "./data/conversation";
import "./styles/global.css";
import "./styles/responsive.css";

export default function App() {
  const { user, booting, signUp, signIn, signOut } = useAuth();
  const [authMode, setAuthMode] = useState("signup");
  const [screen, setScreen] = useState("inbox");
  const [conversations, setConversations] = useState([]);
  const [users, setUsers] = useState([]);
  // seeded from GET /api/users, then presence:* over the socket is authoritative
  const [onlineIds, setOnlineIds] = useState(() => new Set());
  // conversation id -> { items, hasMore, nextCursor, loading }
  const [threads, setThreads] = useState({});
  const requested = useRef(new Set());
  const [activeId, setActiveId] = useState(null);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null);
  const [mobileView, setMobileView] = useState("list");
  // bumped on socket reconnect so already-fetched threads reload and close the gap
  const [epoch, setEpoch] = useState(0);

  const me = user;
  const meId = user?._id ?? null;

  // GET /api/conversations + GET /api/users, once per signed-in user
  useEffect(() => {
    if (!meId) {
      setConversations([]);
      setUsers([]);
      setThreads({});
      requested.current.clear();
      setActiveId(null);
      return;
    }
    let live = true;
    listConversations()
      .then((list) => live && setConversations(list))
      .catch(() => live && setConversations([]));
    listUsers()
      .then((list) => {
        if (!live) return;
        setUsers(list);
        setOnlineIds(new Set(list.filter((u) => u.isOnline).map((u) => u._id)));
      })
      .catch(() => live && setUsers([]));
    return () => {
      live = false;
    };
  }, [meId]);

  const ordered = useMemo(() => [...conversations].sort(byActivity), [conversations]);
  const active = ordered.find((c) => c._id === activeId) ?? null;

  const activeThread = (active && threads[active._id]) ?? EMPTY_THREAD;

  const counts = {
    inbox: conversations.reduce((total, c) => total + (c.unreadCount ?? 0), 0),
    friends: friendRequests.incoming.length,
  };

  const selectScreen = (next) => {
    setScreen(next);
    setMobileView(next === "inbox" ? "list" : "content");
  };

  const patchThread = useCallback(
    (conversationId, update) =>
      setThreads((all) => ({
        ...all,
        [conversationId]: update(all[conversationId] ?? EMPTY_THREAD),
      })),
    [],
  );

  const activeRef = useRef(null);
  activeRef.current = active?._id ?? null;

  // server/docs/protocol.md - fanout only, the client emits nothing
  useSocket(meId, {
    "presence:sync": ({ userIds }) => setOnlineIds(new Set(userIds)),
    "presence:online": ({ userId }) =>
      setOnlineIds((ids) => new Set(ids).add(userId)),
    "presence:offline": ({ userId }) =>
      setOnlineIds((ids) => {
        const next = new Set(ids);
        next.delete(userId);
        return next;
      }),
    "message:new": ({ message }) => {
      const normalized = normalizeMessage(message);
      const seen = document.visibilityState === "visible" ? activeRef.current : null;
      if (requested.current.has(normalized.conversationId)) {
        patchThread(normalized.conversationId, (thread) => putMessage(thread, normalized));
      }
      setConversations((all) => applyMessageToList(all, normalized, seen));
      if (normalized.conversationId === seen && normalized.sender?._id !== meId) {
        markRead(seen).catch(() => {});
      }
    },
    "conversation:new": ({ conversation }) =>
      setConversations((all) => upsertConversation(all, normalizeConversation(conversation))),
    "conversation:updated": ({ conversation }) =>
      setConversations((all) => replaceConversation(all, normalizeConversation(conversation))),
    "conversation:removed": ({ conversationId }) => {
      setConversations((all) => all.filter((c) => c._id !== conversationId));
      setThreads(({ [conversationId]: _dropped, ...rest }) => rest);
      requested.current.delete(conversationId);
      if (activeRef.current === conversationId) {
        setActiveId(null);
        setMobileView("list");
      }
    },
    reconnect: () => {
      listConversations().then(setConversations).catch(() => {});
      requested.current.clear();
      setThreads({});
      setEpoch((n) => n + 1);
    },
    unauthorized: signOut,
  });

  // GET /api/conversations/:id/messages
  useEffect(() => {
    const id = active?._id;
    if (!id || requested.current.has(id)) return;
    requested.current.add(id);

    let live = true;
    patchThread(id, (thread) => ({ ...thread, loading: true }));
    listMessages(id)
      .then((page) => live && patchThread(id, () => ({ ...page, loading: false })))
      .catch(() => {
        // a failed first page must be retryable
        requested.current.delete(id);
        if (live) patchThread(id, (thread) => ({ ...thread, loading: false }));
      });
    return () => {
      live = false;
    };
  }, [active?._id, epoch, patchThread]);

  const loadOlder = useCallback(async () => {
    const id = active?._id;
    const thread = id ? threads[id] : null;
    if (!thread?.hasMore || thread.loading) return;

    patchThread(id, (current) => ({ ...current, loading: true }));
    try {
      const page = await listMessages(id, { cursor: thread.nextCursor });
      patchThread(id, (current) => mergeOlderPage(current, page));
    } catch {
      patchThread(id, (current) => ({ ...current, loading: false }));
    }
  }, [active?._id, threads, patchThread]);

  // back to a tab whose open thread filled up while hidden: clear it now
  useEffect(() => {
    const onVisible = () => {
      const id = activeRef.current;
      if (document.visibilityState !== "visible" || !id) return;
      setConversations((all) =>
        all.map((c) => (c._id === id && c.unreadCount ? { ...c, unreadCount: 0 } : c)),
      );
      markRead(id).catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const openConversation = (id) => {
    setActiveId(id);
    setConversations((all) => all.map((c) => (c._id === id ? { ...c, unreadCount: 0 } : c)));
    setMobileView("chat");
    markRead(id).catch(() => {});
  };

  // POST /api/conversations 
  const startConversation = useCallback(async (payload) => {
    const conversation = await createConversation(payload);
    setConversations((all) =>
      all.some((c) => c._id === conversation._id)
        ? all.map((c) => (c._id === conversation._id ? conversation : c))
        : [conversation, ...all],
    );
    setActiveId(conversation._id);
    setScreen("inbox");
    setMobileView("chat");
  }, []);

  // the row only moves forward: an older send must not pull it back up the list
  const bumpConversation = useCallback(
    (conversationId, message) =>
      setConversations((all) =>
        all.map((c) =>
          c._id === conversationId &&
          new Date(message.createdAt) >= new Date(c.lastActivityAt ?? 0)
            ? { ...c, lastMessage: message, lastActivityAt: message.createdAt }
            : c,
        ),
      ),
    [],
  );

  // POST /api/conversations/:id/messages, appended optimistically first
  const sendMessage = useCallback(
    async ({ content, replyTo = null }) => {
      const conversationId = active?._id;
      if (!conversationId) return;

      // the row's preview before the optimistic bump, to put back if the send fails
      const previous = {
        lastMessage: active.lastMessage ?? null,
        lastActivityAt: active.lastActivityAt,
      };

      const localId = `local-${Date.now()}`;
      const optimistic = {
        _id: localId,
        conversationId,
        sender: me,
        content,
        replyTo,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      patchThread(conversationId, (thread) => putMessage(thread, optimistic));
      bumpConversation(conversationId, optimistic);

      try {
        const saved = await postMessage(conversationId, {
          content,
          ...(replyTo ? { replyToId: replyTo._id } : {}),
        });
        patchThread(conversationId, (thread) => putMessage(thread, saved, localId));
        bumpConversation(conversationId, saved);
      } catch {
        // the text stays on screen marked unsent rather than vanishing
        patchThread(conversationId, (thread) =>
          putMessage(thread, { ...optimistic, pending: false, failed: true }, localId),
        );
        setConversations((all) =>
          all.map((c) =>
            c._id === conversationId && c.lastMessage?._id === localId
              ? { ...c, ...previous }
              : c,
          ),
        );
      }
    },
    [active, me, patchThread, bumpConversation],
  );

  // PATCH /api/conversations/:id - a rename is not activity, so the row must not move.
  // Applied optimistically; the server's copy (also broadcast as conversation:updated) wins.
  const renameGroup = async (groupName) => {
    const id = active?._id;
    if (!id) return;
    const previous = active.groupName;
    setConversations((all) => all.map((c) => (c._id === id ? { ...c, groupName } : c)));
    try {
      const saved = await patchGroupName(id, groupName);
      setConversations((all) => replaceConversation(all, saved));
    } catch (failure) {
      setConversations((all) =>
        all.map((c) => (c._id === id ? { ...c, groupName: previous } : c)),
      );
      throw failure;
    }
  };

  // POST /api/conversations/:id/members - the Modal owns pending/error state,
  // as ChatPanel does for rename and leave: mutations throw, the caller shows the message
  const addMembers = async (members) => {
    const saved = await postMembers(active._id, members);
    setConversations((all) => replaceConversation(all, saved));
  };

  // DELETE /api/conversations/:id/members/me - the server also sends conversation:removed,
  // but the local drop happens here so the UI does not wait on the socket
  const leaveGroup = async () => {
    const id = active?._id;
    if (!id) return;
    await leaveConversation(id);
    setConversations((all) => all.filter((c) => c._id !== id));
    setThreads(({ [id]: _dropped, ...rest }) => rest);
    requested.current.delete(id);
    setActiveId(null);
    setMobileView("list");
  };

  if (booting) return <main className="center-screen" aria-busy="true" />;

  if (!user) {
    const authProps = {
      onModeChange: setAuthMode,
      onEnter: authMode === "signup" ? signUp : signIn,
    };
    return authMode === "signup" ? <Signup {...authProps} /> : <Login {...authProps} />;
  }

  return (
    <AppLayout
      sidebarProps={{
        screen,
        setScreen: selectScreen,
        counts,
        onLogout: signOut,
      }}
    >
      {screen === "inbox" ? (
        <>
          <div className={`mobile-pane mobile-list ${mobileView === "list" ? "visible" : "hidden"}`}>
            <ConversationList
              conversations={ordered}
              users={users}
              me={me}
              onlineIds={onlineIds}
              activeId={active?._id ?? null}
              onSelect={openConversation}
              query={query}
              setQuery={setQuery}
              onNewMessage={() => setModal("new")}
            />
          </div>
          <div className={`mobile-pane mobile-chat ${mobileView === "chat" ? "visible" : "hidden"}`}>
            <ChatPanel
              conversation={active}
              me={me}
              onlineIds={onlineIds}
              messages={activeThread.items}
              loading={activeThread.loading}
              hasMore={activeThread.hasMore}
              onLoadOlder={loadOlder}
              onSend={sendMessage}
              onAddMembers={() => setModal("members")}
              onRename={renameGroup}
              onLeave={leaveGroup}
              onBack={() => setMobileView("list")}
            />
          </div>
        </>
      ) : screen === "friends" ? (
        <FriendsScreen requests={friendRequests} />
      ) : (
        <SettingsScreen user={user} onLogout={signOut} />
      )}
      <Modal
        type={modal}
        conversation={active}
        users={users}
        me={me}
        onlineIds={onlineIds}
        onCreate={startConversation}
        onAddMembers={addMembers}
        close={() => setModal(null)}
      />
    </AppLayout>
  );
}
