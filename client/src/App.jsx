import { useMemo, useState } from "react";
import Login from "./pages/Login/Login";
import Signup from "./pages/Signup/Signup";
import ConversationList from "./pages/Inbox/ConversationList";
import ChatPanel from "./pages/Inbox/ChatPanel";
import FriendsScreen from "./pages/Friends/FriendsScreen";
import SettingsScreen from "./pages/Settings/SettingsScreen";
import Modal from "./components/Modal/Modal";
import AppLayout from "./layouts/AppLayout/AppLayout";
import {
  currentUser,
  conversations as seedConversations,
  messagesByConversation,
  onlineUserIds,
  friendRequests,
} from "./data/mockData";
import { byActivity } from "./data/conversation";
import "./styles/global.css";
import "./styles/responsive.css";

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState("signup");
  const [screen, setScreen] = useState("inbox");
  const [conversations, setConversations] = useState(seedConversations);
  const [threads, setThreads] = useState(messagesByConversation);
  const [activeId, setActiveId] = useState(seedConversations[0]?._id ?? null);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null);
  const [mobileView, setMobileView] = useState("list");

  // GET /api/conversations 
  const ordered = useMemo(() => [...conversations].sort(byActivity), [conversations]);
  const active = ordered.find((c) => c._id === activeId) ?? ordered[0] ?? null;

  const counts = {
    inbox: conversations.reduce((total, c) => total + (c.unreadCount ?? 0), 0),
    friends: friendRequests.incoming.length,
  };

  const selectScreen = (next) => {
    setScreen(next);
    setMobileView(next === "inbox" ? "list" : "content");
  };

  const openConversation = (id) => {
    setActiveId(id);
    setConversations((all) => all.map((c) => (c._id === id ? { ...c, unreadCount: 0 } : c)));
    setMobileView("chat");
  };

  const sendMessage = (content) => {
    if (!active) return;
    const now = new Date().toISOString();
    const message = {
      _id: `local-${Date.now()}`,
      conversationId: active._id,
      sender: currentUser,
      content,
      replyTo: null,
      createdAt: now,
    };
    // optimistic append; the server's copy arrives over message:new
    setThreads((all) => ({ ...all, [active._id]: [...(all[active._id] ?? []), message] }));
    setConversations((all) =>
      all.map((c) =>
        c._id === active._id ? { ...c, lastMessage: message, lastActivityAt: now } : c,
      ),
    );
  };

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

  if (!authenticated) {
    const authProps = { onModeChange: setAuthMode, onEnter: () => setAuthenticated(true) };
    return authMode === "signup" ? <Signup {...authProps} /> : <Login {...authProps} />;
  }

  return (
    <AppLayout
      sidebarProps={{
        screen,
        setScreen: selectScreen,
        counts,
        onLogout: () => window.location.reload(),
      }}
    >
      {screen === "inbox" ? (
        <>
          <div className={`mobile-pane mobile-list ${mobileView === "list" ? "visible" : "hidden"}`}>
            <ConversationList
              conversations={ordered}
              me={currentUser}
              onlineIds={onlineUserIds}
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
              me={currentUser}
              onlineIds={onlineUserIds}
              messages={active ? threads[active._id] ?? [] : []}
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
        <SettingsScreen user={currentUser} onLogout={() => window.location.reload()} />
      )}
      <Modal
        type={modal}
        conversation={active}
        me={currentUser}
        onlineIds={onlineUserIds}
        close={() => setModal(null)}
      />
    </AppLayout>
  );
}
