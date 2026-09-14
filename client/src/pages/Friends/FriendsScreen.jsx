import { useState } from "react";
import Avatar from "../../components/Avatar/Avatar";
import { errorMessage } from "../../api/client";
import "./friends.css";

export default function FriendsScreen({ requests, onAccept, onRemove }) {
  const [tab, setTab] = useState("incoming");
  const [pendingId, setPendingId] = useState(null);
  const [error, setError] = useState(null);

  const rows = requests[tab] ?? [];

  const act = async (id, action) => {
    if (pendingId) return;
    setPendingId(id);
    setError(null);
    try {
      await action(id);
    } catch (failure) {
      setError(errorMessage(failure, "Could not update the friend request"));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className="center-screen">
      <div className="friends-card">
        <header className="friends-head">
          <h1>Friend requests</h1>
          <p>People who want to connect with you.</p>
        </header>

        {error && <p className="friends-error" role="alert">{error}</p>}

        <div className="tabs" role="tablist">
          {["incoming", "outgoing"].map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              className={`tab ${tab === key ? "active" : ""}`}
              onClick={() => setTab(key)}
            >
              {key === "incoming" ? "Incoming" : "Sent"}
              <span className="tab-count">{(requests[key] ?? []).length}</span>
            </button>
          ))}
        </div>

        <ul className="request-list">
          {rows.map((row) => (
            <li className="request-row" key={row._id}>
              <Avatar src={row.user.avatar} size={44} />
              <div className="request-copy">
                <strong>{row.user.name}</strong>
                <span>@{row.user.userName}</span>
              </div>
              {tab === "incoming" ? (
                <div className="request-actions">
                  <button
                    className="accept"
                    disabled={Boolean(pendingId)}
                    onClick={() => act(row._id, onAccept)}
                  >
                    {pendingId === row._id ? "Accepting…" : "Accept"}
                  </button>
                  <button
                    className="decline"
                    disabled={Boolean(pendingId)}
                    onClick={() => act(row._id, onRemove)}
                  >
                    Decline
                  </button>
                </div>
              ) : (
                <div className="request-actions">
                  <span className="pending-tag">Pending</span>
                  <button
                    className="decline"
                    disabled={Boolean(pendingId)}
                    onClick={() => act(row._id, onRemove)}
                  >
                    {pendingId === row._id ? "Withdrawing…" : "Withdraw"}
                  </button>
                </div>
              )}
            </li>
          ))}

          {rows.length === 0 && (
            <li className="request-empty">
              {tab === "incoming" ? "No incoming requests right now." : "You have no pending invites."}
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}
