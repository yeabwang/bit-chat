import React, { useState } from "react";
import Login from "./pages/Login/Login";
import Signup from "./pages/Signup/Signup";
import ConversationList from "./pages/Inbox/ConversationList";
import ChatPanel from "./pages/Inbox/ChatPanel";
import FriendsScreen from "./pages/Friends/FriendsScreen";
import SettingsScreen from "./pages/Settings/SettingsScreen";
import Modal from "./components/Modal/Modal";
import AppLayout from "./layouts/AppLayout/AppLayout";
import "./styles/global.css";
import "./styles/responsive.css";

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState("signup");
  const [screen, setScreen] = useState("inbox");
  const [selected, setSelected] = useState(0);
  const [query, setQuery] = useState("");
  const [dark, setDark] = useState(false);
  const [modal, setModal] = useState(null);
  const [mobileView, setMobileView] = useState("list");

  const selectScreen = (next) => {
    setScreen(next);
    if (next !== "inbox") setMobileView("content");
    else setMobileView("list");
  };

  if (!authenticated) {
    const authProps = { onModeChange: setAuthMode, onEnter: () => setAuthenticated(true) };
    return authMode === "signup" ? <Signup {...authProps} /> : <Login {...authProps} />;
  }

  return (
    <AppLayout sidebarProps={{ screen, setScreen: selectScreen, onNewMessage: () => setModal("new"), dark, setDark }}>
      {screen === "inbox" ? (
        <>
          <div className={`mobile-pane mobile-list ${mobileView === "list" ? "visible" : "hidden"}`}>
            <ConversationList selected={selected} setSelected={setSelected} query={query} setQuery={setQuery} onBack={() => setMobileView("chat")} />
          </div>
          <div className={`mobile-pane mobile-chat ${mobileView === "chat" ? "visible" : "hidden"}`}>
            <ChatPanel selected={selected} onHeaderAction={() => setModal("group")} onBack={() => setMobileView("list")} />
          </div>
        </>
      ) : screen === "friends" ? <FriendsScreen /> : <SettingsScreen />}
      <Modal type={modal} close={() => setModal(null)} />
    </AppLayout>
  );
}
