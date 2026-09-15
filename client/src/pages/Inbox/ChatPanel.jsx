import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import Avatar from "../../components/Avatar/Avatar";
import AvatarStack from "../../components/Avatar/AvatarStack";
import { errorMessage } from "../../api/client";
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
  isReadByAll,
  startsRun,
} from "../../data/conversation";
import "./inbox.css";

const MAX_LENGTH = 4000; // server rule: content is 1-4000 characters, trimmed
const NEAR_TOP_PX = 120; // how close to the top starts the next page

export default function ChatPanel({
  conversation,
  me,
  onlineIds,
  messages,
  loading,
  hasMore,
  canSend = true,
  typingUsers = [],
  onLoadOlder,
  onSend,
  onTypingChange,
  onAddMembers,
  onRename,
  onLeave,
  onBack,
}) {
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [error, setError] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const endRef = useRef(null);
  const areaRef = useRef(null);

  const anchorRef = useRef(null);
  const typingTimerRef = useRef(null);
  const typingSentRef = useRef(false);

  const oldestId = messages[0]?._id;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [conversation?._id, messages.at(-1)?._id, typingUsers.length]);

  useEffect(() => {
    setMenuOpen(false);
    setDraft("");
    setReplyTo(null);
    setError(null);
    anchorRef.current = null;
  }, [conversation?._id]);

  useEffect(() => {
    const conversationId = conversation?._id;
    return () => {
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      if (typingSentRef.current && conversationId) {
        onTypingChange?.(conversationId, false);
      }
      typingSentRef.current = false;
    };
  }, [conversation?._id, onTypingChange]);

  const pageBack = () => {
    const area = areaRef.current;
    if (!area || !hasMore || loading) return;
    // oldestId pins the anchor to this thread state: the request also flips
    // `loading`, and that re-render must not spend the anchor before the page lands
    anchorRef.current = {
      scrollHeight: area.scrollHeight,
      scrollTop: area.scrollTop,
      oldestId,
    };
    onLoadOlder();
  };

  const onScroll = () => {
    if (areaRef.current && areaRef.current.scrollTop <= NEAR_TOP_PX) pageBack();
  };

  // restore the reading position before paint, then keep paging while the thread
  // is too short to scroll - otherwise there is no gesture left to ask with
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;

    const anchor = anchorRef.current;
    if (anchor && anchor.oldestId !== oldestId) {
      anchorRef.current = null;
      area.scrollTop = anchor.scrollTop + (area.scrollHeight - anchor.scrollHeight);
      return;
    }

    if (!anchor && hasMore && !loading && area.scrollHeight <= area.clientHeight)
      pageBack();
  }, [oldestId, hasMore, loading]);

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
    if (!trimmed || !canSend) return;
    onSend({ content: trimmed, replyTo });
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
    typingSentRef.current = false;
    onTypingChange?.(conversation._id, false);
    setDraft("");
    setReplyTo(null);
  };

  const updateDraft = (value) => {
    const next = value.slice(0, MAX_LENGTH);
    setDraft(next);
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);

    if (!next.trim()) {
      if (typingSentRef.current) onTypingChange?.(conversation._id, false);
      typingSentRef.current = false;
      typingTimerRef.current = null;
      return;
    }

    if (!typingSentRef.current) {
      onTypingChange?.(conversation._id, true);
      typingSentRef.current = true;
    }
    typingTimerRef.current = window.setTimeout(() => {
      typingSentRef.current = false;
      typingTimerRef.current = null;
      onTypingChange?.(conversation._id, false);
    }, 1200);
  };

  const typingLabel =
    typingUsers.length === 1
      ? `${typingUsers[0].name} is typing`
      : typingUsers.length === 2
        ? `${typingUsers[0].name} and ${typingUsers[1].name} are typing`
        : typingUsers.length > 2
          ? `${typingUsers[0].name} and ${typingUsers.length - 1} others are typing`
          : "";

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      submit(event);
    }
  };

  // rename and leave throw on failure; the message lands under the header
  const attempt = (action, fallback) =>
    Promise.resolve()
      .then(action)
      .catch((failure) => setError(errorMessage(failure, fallback)));

  const rename = () => {
    const next = window.prompt("Group name", conversation.groupName ?? "");
    setMenuOpen(false);
    const clean = next?.trim();
    if (clean && clean !== conversation.groupName) {
      attempt(() => onRename(clean), "Could not rename the group");
    }
  };

  const leave = () => {
    setMenuOpen(false);
    if (window.confirm(`Leave “${titleOf(conversation, me._id)}”? You will lose access to its history.`)) {
      attempt(onLeave, "Could not leave the group");
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

      {error && (
        <p className="chat-error" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </p>
      )}

      <div className="message-area" ref={areaRef} onScroll={onScroll}>
        {loading && messages.length > 0 && (
          <p className="history-loading" role="status">
            Loading earlier messages…
          </p>
        )}

        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const mine = message.sender?._id === me._id;
          const newRun = startsRun(message, previous);
          const newDay = !previous || dayOf(previous.createdAt) !== dayOf(message.createdAt);
          const read = mine && isReadByAll(message, conversation);

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
                  <div
                    className={`${mine ? "bubble mine-bubble" : "bubble"}${
                      message.pending ? " bubble-pending" : ""
                    }${message.failed ? " bubble-failed" : ""}`}
                  >
                    {message.replyTo && (
                      <blockquote className="quote">
                        <strong>{message.replyTo.sender?.name}</strong>
                        <span>{message.replyTo.content}</span>
                      </blockquote>
                    )}
                    {message.content}
                  </div>
                  {mine && !message.pending && !message.failed && (
                    <span
                      className={`message-receipt ${read ? "read" : ""}`}
                      aria-label={read ? "Read" : "Delivered"}
                      title={read ? "Read" : "Delivered"}
                    >
                      {read ? "✓✓" : "✓"}
                    </span>
                  )}
                  {!message.pending && !message.failed && (
                    <button
                      type="button"
                      className="reply-button"
                      onClick={() => setReplyTo(message)}
                      aria-label={`Reply to ${message.sender?.name}`}
                    >
                      Reply
                    </button>
                  )}
                  {message.failed && <span className="message-failed">Not sent</span>}
                </div>
              </div>
            </Fragment>
          );
        })}
        {messages.length === 0 && loading && (
          <p className="empty-note">Loading messages…</p>
        )}
        {messages.length === 0 && !loading && (
          <p className="empty-note">
            No messages yet. Say hello to {titleOf(conversation, me._id)}.
          </p>
        )}
        {typingUsers.length > 0 && (
          <div
            className="message typing-message run-start"
            role="status"
            aria-live="polite"
            aria-label={`${typingLabel}…`}
          >
            <span className="message-gutter">
              <Avatar src={typingUsers[0].avatar} size={30} />
            </span>
            <div className="message-body">
              {group && (
                <div className="message-meta">
                  <strong>{typingUsers[0].name}</strong>
                </div>
              )}
              <div className="bubble typing-bubble" aria-hidden="true">
                <span>typing</span>
                <span className="typing-dots">
                  <i /><i /><i />
                </span>
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={submit}>
        {replyTo && (
          <div className="reply-bar">
            <span>
              Replying to <strong>{replyTo.sender?.name}</strong>: {replyTo.content}
            </span>
            <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">×</button>
          </div>
        )}
        <textarea
          value={draft}
          disabled={!canSend}
          onChange={(event) => updateDraft(event.target.value)}
          onBlur={() => {
            if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
            typingTimerRef.current = null;
            if (typingSentRef.current) onTypingChange?.(conversation._id, false);
            typingSentRef.current = false;
          }}
          onKeyDown={onKeyDown}
          maxLength={MAX_LENGTH}
          rows={1}
          placeholder={
            canSend
              ? `Message ${titleOf(conversation, me._id)}`
              : "You need to be friends before you can send messages"
          }
          aria-label="Write a message"
        />
        <div className="composer-tools">
          <span className="composer-hint">
            {canSend
              ? "Enter to send, Shift + Enter for a new line"
              : "This direct message is read-only until the friendship is accepted"}
          </span>
          {draft.length > MAX_LENGTH - 200 && (
            <span className="composer-count">{MAX_LENGTH - draft.length}</span>
          )}
          <button type="submit" disabled={!trimmed || !canSend}>Send</button>
        </div>
      </form>
    </section>
  );
}
