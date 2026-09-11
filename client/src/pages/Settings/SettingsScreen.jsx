import Avatar from "../../components/Avatar/Avatar";
import { avatarFor } from "../../lib/avatar";
import "./settings.css";

// GET /api/auth/status to read it, POST /api/auth/logout to sign out.
export default function SettingsScreen({ user, onLogout }) {
  return (
    <section className="center-screen">
      <div className="settings-card">
        <h1>Settings</h1>

        <div className="profile-row">
          <Avatar src={avatarFor(user)} size={64} />
          <div className="profile-copy">
            <strong>{user.name}</strong>
            <span>@{user.userName}</span>
          </div>
        </div>

        <dl className="settings-list">
          <div className="settings-row">
            <dt>Display name</dt>
            <dd>{user.name}</dd>
          </div>
          <div className="settings-row">
            <dt>Username</dt>
            <dd>@{user.userName}</dd>
          </div>
        </dl>

        <button className="logout-button" onClick={onLogout}>Log out</button>
      </div>
    </section>
  );
}
