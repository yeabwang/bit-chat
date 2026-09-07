
import React from "react";
import { ASSETS } from "../../data/assets";
import Icon from "../Icon/Icon";
import "./sidebar.css";

const items = [
  { id: "inbox", label: "Inbox", icon: ASSETS.messages, count: 14 },
  { id: "friends", label: "Friend requests", icon: ASSETS.notification, count: 21 }
];

export default function Sidebar({ screen, setScreen, onNewMessage, dark, setDark, onMobileClose }) {
  const navigate = (next) => { setScreen(next); onMobileClose?.(); };

  return (
    <aside className="sidebar">
      <button className="new-message" onClick={onNewMessage}><Icon src={ASSETS.add} size={16} /><span>New Message</span></button>
      {items.map((item) => (
        <button key={item.id} className={`side-item ${screen === item.id ? "active" : ""}`} onClick={() => navigate(item.id)}>
          <Icon src={item.icon} /><span>{item.label}</span><b>{item.count}</b>
        </button>
      ))}
      <div className="sidebar-spacer" />
      <div className="sidebar-divider" />
      <button className="side-item" onClick={() => setDark(!dark)}><span className={`toggle ${dark ? "on" : ""}`}><span /></span><span>Dark</span></button>
      <button className="side-item" onClick={() => alert("Help is UI-only in this prototype.")}><Icon src={ASSETS.help} /><span>Help</span></button>
      <button className="side-item" onClick={() => navigate("settings")}><Icon src={ASSETS.settings} /><span>Settings</span></button>
      <button className="side-item" onClick={() => window.location.reload()}><Icon src={ASSETS.logout} /><span>Log out</span></button>
    </aside>
  );
}
