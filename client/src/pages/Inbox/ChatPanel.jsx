import { Fragment, useEffect, useRef, useState } from "react";
import Avatar from "../../components/Avatar/Avatar";
import AvatarStack from "../../components/Avatar/AvatarStack";
import {
  titleOf,
  avatarsOf,
  otherParticipant,
  memberCount,
  onlineCount,
  isPeerOnline,
  canManage,
  timeOf,
  dayOf,
  startsRun,
} from "../../data/conversation";
import "./inbox.css";

const MAX_LENGTH = 4000; // server rule: content is 1-4000 characters, trimmed

export default function ChatPanel({
  conversation,
  me,
  onlineIds,
  messages,
  onSend,
  onAddMembers,
  onRename,
  onLeave,
  onBack,
}) {
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [conversation?._id, messages.length]);

  useEffect(() => {
    setMenuOpen(false);
    setDraft("");
  }, [conversation?._id]);

  if (!conversation) {
    return (
      <section className="chat-panel chat-empty">
        <p>Select a conversation to start reading.</p>
      </section>
    );
  }

  const group = conversation.isGroup;
  const peer = otherParticipant(conversation, me._id);
  const people = avatarsOf(conversation, me._id);
  const trimmed = draft.trim();

  const submit = (event) => {
    event.preventDefault();
    if (!trimmed) return;
    onSend(trimmed);
    setDraft("");
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      submit(event);
    }
  };

  const rename = () => {
    const next = window.prompt("Group name", conversation.groupName ?? "");
    setMenuOpen(false);
    const clean = next?.trim();
    if (clean && clean !== conversation.groupName) onRename(clean);
  };

  const leave = () => {
    setMenuOpen(false);
    if (window.confirm(`Leave “${titleOf(conversation, me._id)}”? You will lose access to its history.`)) {
      onLeave();
    }
  };

  return (
    <section className="chat-panel">
      <header className="chat-header">
        <div className="chat-identity">
          <button className="mobile-back" onClick={onBack} aria-label="Back to inbox">‹</button>
          {group ? (
            <AvatarStack people={people} size={44} />
          ) : (
            <Avatar src={peer?.avatar} size={44} online={isPeerOnline(conversation, me._id, onlineIds)} />
          )}
          <div className="chat-titles">
            <h2>{titleOf(conversation, me._id)}</h2>
            {group ? (
              <p>
                {memberCount(conversation)} members
                <span className="dot-sep" aria-hidden="true" />
                <span className="live">{onlineCount(conversation, onlineIds)} online</span>
              </p>
            ) : (
              <p>
                @{peer?.userName}
                <span className="dot-sep" aria-hidden="true" />
                {isPeerOnline(conversation, me._id, onlineIds) ? (
                  <span className="live">Online</span>
                ) : (
                  "Offline"
                )}
              </p>
            )}
          </div>
        </div>

        {/* rename, add members and leave are group-only: the server answers 400 on a DM */}
        {canManage(conversation) && (
          <div className="chat-actions">
            <button className="ghost-button" onClick={onAddMembers}>Add members</button>
            <div className="menu-wrap">
              <button
                className="icon-button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Group options"
              >
                <span className="ellipsis">•••</span>
              </button>
              {menuOpen && (
                <div className="menu" role="menu">
                  <button role="menuitem" onClick={rename}>Rename group</button>
                  <button role="menuitem" className="menu-danger" onClick={leave}>Leave group</button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      <div className="message-area">
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const mine = message.sender?._id === me._id;
          const newRun = startsRun(message, previous);
          const newDay = !previous || dayOf(previous.createdAt) !== dayOf(message.createdAt);

          return (
            <Fragment key={message._id}>
              {newDay && (
                <div className="day-divider"><span /><b>{dayOf(message.createdAt)}</b><span /></div>
              )}
              <div className={`message ${mine ? "mine" : ""} ${newRun ? "run-start" : "run-cont"}`}>
                <span className="message-gutter">
                  {newRun && !mine && <Avatar src={message.sender?.avatar} size={30} />}
                </span>
                <div className="message-body">
                  {newRun && (
                    <div className="message-meta">
                      {group && !mine && <strong>{message.sender?.name}</strong>}
                      <time dateTime={message.createdAt}>{timeOf(message.createdAt)}</time>
                    </div>
                  )}
                  <div className={mine ? "bubble mine-bubble" : "bubble"}>{message.content}</div>
                </div>
              </div>
            </Fragment>
          );
        })}
        {messages.length === 0 && (
          <p className="empty-note">
            No messages yet. Say hello to {titleOf(conversation, me._id)}.
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={submit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, MAX_LENGTH))}
          onKeyDown={onKeyDown}
          maxLength={MAX_LENGTH}
          rows={1}
          placeholder={`Message ${titleOf(conversation, me._id)}`}
          aria-label="Write a message"
        />
        <div className="composer-tools">
          <span className="composer-hint">Enter to send, Shift + Enter for a new line</span>
          {draft.length > MAX_LENGTH - 200 && (
            <span className="composer-count">{MAX_LENGTH - draft.length}</span>
          )}
          <button type="submit" disabled={!trimmed}>Send</button>
        </div>
      </form>
    </section>
  );
}
