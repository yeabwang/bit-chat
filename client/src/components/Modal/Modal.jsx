import { useEffect, useState } from "react";
import { errorMessage } from "../../api/client";
import { createPortal } from "react-dom";
import Avatar from "../Avatar/Avatar";
import { titleOf, newConversationPayload } from "../../data/conversation";
import "./modal.css";

/**
 * "new"     -> POST /api/conversations
 * "members" -> POST /api/conversations/:id/members
 */
export default function Modal({
  type,
  conversation,
  users = [],
  me,
  onlineIds,
  onCreate,
  onAddMembers,
  close,
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setQuery("");
    setPicked([]);
    setGroupName("");
    setPending(false);
    setError(null);
  }, [type]);

  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  if (!type) return null;

  const existing = new Set((conversation?.participants ?? []).map((p) => p._id));
  const pool = users
    .filter((u) => u._id !== me?._id)
    .filter((u) => (type === "members" ? !existing.has(u._id) : true))
    .filter((u) => `${u.name} ${u.userName}`.toLowerCase().includes(query.trim().toLowerCase()));

  const toggle = (id) =>
    setPicked((all) => (all.includes(id) ? all.filter((x) => x !== id) : [...all, id]));

  // a two-person thread is a DM, so the server rejects a group of fewer than two others
  const isGroup = picked.length >= 2;
  const canSubmit =
    type === "members"
      ? picked.length >= 1
      : picked.length === 1 || (isGroup && groupName.trim().length > 0);

  const heading = type === "members" ? `Add members to ${titleOf(conversation, me?._id)}` : "New message";

  // the discriminated union the server validates: a single pick is a DM, two or more a group
  const submit = async () => {
    if (!canSubmit || pending) return;
    setPending(true);
    setError(null);
    try {
      if (type === "members") await onAddMembers(picked);
      else await onCreate(newConversationPayload(picked, groupName));
      close();
    } catch (failure) {
      setError(
        errorMessage(failure, type === "members" ? "Could not add members" : "Could not start the chat"),
      );
      setPending(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={heading} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{heading}</h2>
          <button className="modal-x" onClick={close} aria-label="Close">×</button>
        </header>

        {type === "new" && isGroup && (
          <label className="modal-field">
            Group name
            <input
              value={groupName}
              onChange={(event) => setGroupName(event.target.value.slice(0, 60))}
              maxLength={60}
              placeholder="Study group"
            />
          </label>
        )}

        <input
          className="modal-search"
          type="search"
          placeholder="Search by name or username"
          aria-label="Search people"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <ul className="member-list">
          {pool.map((user) => {
            const on = picked.includes(user._id);
            return (
              <li key={user._id}>
                <button className={`member-row ${on ? "picked" : ""}`} onClick={() => toggle(user._id)} aria-pressed={on}>
                  <Avatar src={user.avatar} size={40} online={onlineIds?.has(user._id)} />
                  <span className="member-copy">
                    <strong>{user.name}</strong>
                    <span>@{user.userName}</span>
                  </span>
                  <span className="check-circle" aria-hidden="true">{on ? "✓" : ""}</span>
                </button>
              </li>
            );
          })}
          {pool.length === 0 && <li className="modal-empty">No people match that search.</li>}
        </ul>

        <footer className="modal-foot">
          <span className="modal-hint" role={error ? "alert" : undefined}>
            {error}
            {!error && type === "new" && picked.length === 1 && "Opens a direct message"}
            {!error && type === "new" && isGroup && `Group of ${picked.length + 1}`}
            {!error && type === "new" && picked.length === 0 && "Pick one person for a DM, or two or more for a group"}
            {!error && type === "members" && `${picked.length} selected`}
          </span>
          <button className="modal-primary" disabled={!canSubmit || pending} onClick={submit}>
            {type === "members" ? "Add" : isGroup ? "Create group" : "Start chat"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
