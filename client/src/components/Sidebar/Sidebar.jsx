import wordmark from "../../assets/logo-wordmark.svg";
import Icon from "../Icon/Icon";
import "./sidebar.css";

const items = [
  { id: "inbox", label: "Inbox", icon: "messages" },
  { id: "friends", label: "Friend requests", icon: "notification" },
];

export default function Sidebar({ screen, setScreen, counts = {}, onMobileClose, onLogout }) {
  const navigate = (next) => {
    setScreen(next);
    onMobileClose?.();
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img className="sidebar-wordmark" src={wordmark} alt="Beijing Institute of Technology" />
      </div>

      <nav className="sidebar-nav" aria-label="Main">
        {items.map((item) => {
          const active = screen === item.id;
          const count = counts[item.id] ?? 0;
          return (
            <button
              key={item.id}
              className={`side-item ${active ? "active" : ""}`}
              onClick={() => navigate(item.id)}
              aria-current={active ? "page" : undefined}
            >
              <Icon name={item.icon} />
              <span className="side-label">{item.label}</span>
              {count > 0 && (
                <b aria-label={`${count} unread`}>{count > 99 ? "99+" : count}</b>
              )}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-spacer" />
      <div className="sidebar-divider" />

      <button
        className={`side-item ${screen === "settings" ? "active" : ""}`}
        onClick={() => navigate("settings")}
        aria-current={screen === "settings" ? "page" : undefined}
      >
        <Icon name="settings" />
        <span className="side-label">Settings</span>
      </button>
      <button className="side-item" onClick={onLogout}>
        <Icon name="logout" />
        <span className="side-label">Log out</span>
      </button>
    </aside>
  );
}
