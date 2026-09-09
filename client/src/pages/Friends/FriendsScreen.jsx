import { useState } from "react";
import Avatar from "../../components/Avatar/Avatar";
import "./friends.css";

// No endpoints behind this yet;
export default function FriendsScreen({ requests }) {
  const [tab, setTab] = useState("incoming");
  const [resolved, setResolved] = useState({});

  const rows = requests[tab] ?? [];
  const pending = rows.filter((row) => !resolved[row._id]);

  const resolve = (id, outcome) => setResolved((all) => ({ ...all, [id]: outcome }));

  return (
    <section className="center-screen">
      <div className="friends-card">
        <header className="friends-head">
          <h1>Friend requests</h1>
          <p>People who want to connect with you.</p>
        </header>

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
          {pending.map((row) => (
            <li className="request-row" key={row._id}>
              <Avatar src={row.user.avatar} size={44} />
              <div className="request-copy">
                <strong>{row.user.name}</strong>
                <span>@{row.user.userName}</span>
              </div>
              {tab === "incoming" ? (
                <div className="request-actions">
                  <button className="accept" onClick={() => resolve(row._id, "accepted")}>
                    Accept
                  </button>
                  <button className="decline" onClick={() => resolve(row._id, "declined")}>
                    Decline
                  </button>
                </div>
              ) : (
                <div className="request-actions">
                  <span className="pending-tag">Pending</span>
                  <button className="decline" onClick={() => resolve(row._id, "withdrawn")}>
                    Withdraw
                  </button>
                </div>
              )}
            </li>
          ))}

          {pending.length === 0 && (
            <li className="request-empty">
              {tab === "incoming" ? "No incoming requests right now." : "You have no pending invites."}
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}
