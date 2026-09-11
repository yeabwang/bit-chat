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
import { listConversations, createConversation } from "./api/conversations";
import { listUsers } from "./api/users";
import { listMessages, sendMessage as postMessage } from "./api/messages";
import { friendRequests } from "./data/friendRequests";
import {
  byActivity,
  EMPTY_THREAD,
  mergeOlderPage,
  putMessage,
} from "./data/conversation";
import "./styles/global.css";
import "./styles/responsive.css";

export default function App() {
  const { user, booting, signUp, signIn, signOut } = useAuth();
  const [authMode, setAuthMode] = useState("signup");
  const [screen, setScreen] = useState("inbox");
  const [conversations, setConversations] = useState([]);
  const [users, setUsers] = useState([]);
  // conversation id -> { items, hasMore, nextCursor, loading }
  const [threads, setThreads] = useState({});
  const requested = useRef(new Set());
  const [activeId, setActiveId] = useState(null);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null);
  const [mobileView, setMobileView] = useState("list");

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
      .then((list) => live && setUsers(list))
      .catch(() => live && setUsers([]));
    return () => {
      live = false;
    };
  }, [meId]);

  // the socket feed replaces it later
  const onlineIds = useMemo(
    () => new Set(users.filter((u) => u.isOnline).map((u) => u._id)),
    [users],
  );

  const ordered = useMemo(() => [...conversations].sort(byActivity), [conversations]);
  const active = ordered.find((c) => c._id === activeId) ?? ordered[0] ?? null;

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
  }, [active?._id, patchThread]);

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

  const openConversation = (id) => {
    setActiveId(id);
    setConversations((all) => all.map((c) => (c._id === id ? { ...c, unreadCount: 0 } : c)));
    setMobileView("chat");
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
    async (content) => {
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
        replyTo: null,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      patchThread(conversationId, (thread) => putMessage(thread, optimistic));
      bumpConversation(conversationId, optimistic);

      try {
        const saved = await postMessage(conversationId, { content });
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

  // PATCH /api/conversations/:id - a rename is not activity, so the row must not move
  const renameGroup = (groupName) =>
    setConversations((all) =>
      all.map((c) => (c._id === active?._id ? { ...c, groupName } : c)),
    );

  // DELETE /api/conversations/:id/members/me, then conversation:removed
  const leaveGroup = () => {
    setConversations((all) => all.filter((c) => c._id !== active?._id));
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
        close={() => setModal(null)}
      />
    </AppLayout>
  );
}
