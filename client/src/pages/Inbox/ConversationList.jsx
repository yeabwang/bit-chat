import { useMemo } from "react";
import Avatar from "../../components/Avatar/Avatar";
import AvatarStack from "../../components/Avatar/AvatarStack";
import Icon from "../../components/Icon/Icon";
import {
  titleOf,
  avatarsOf,
  previewOf,
  isPeerOnline,
  memberCount,
  timeOf,
} from "../../data/conversation";
import "./inbox.css";

export default function ConversationList({
  conversations,
  users,
  me,
  onlineIds,
  typingByConversation = {},
  activeId,
  onSelect,
  query,
  setQuery,
  onNewMessage,
}) {
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return conversations;
    return conversations.filter((c) =>
      `${titleOf(c, me._id)} ${previewOf(c, me._id)}`.toLowerCase().includes(needle),
    );
  }, [conversations, query, me._id]);

  const unread = conversations.reduce((total, c) => total + (c.unreadCount ?? 0), 0);
  const online = users.filter((u) => onlineIds.has(u._id));

  return (
    <section className="conversation-panel">
      <header className="inbox-header">
        <div className="title-row">
          <h2>Inbox</h2>
          <button className="icon-button" onClick={onNewMessage} title="New message" aria-label="New message">
            <Icon name="edit" size={18} />
          </button>
        </div>
        <p className="inbox-summary">
          {conversations.length} conversation{conversations.length === 1 ? "" : "s"}
          {unread > 0 && (
            <>
              <span className="dot-sep" aria-hidden="true" />
              {unread} unread
            </>
          )}
        </p>
      </header>

      <div className="search-box">
        <Icon name="search" size={16} />
        <input
          type="search"
          placeholder="Search conversations"
          aria-label="Search conversations"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {online.length > 0 && (
        <div className="online-strip">
          <h3>Online now</h3>
          <ul className="online-row">
            {online.slice(0, 8).map((user) => (
              <li key={user._id} title={`${user.name} (@${user.userName})`}>
                <Avatar src={user.avatar} size={36} online />
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="conversation-list">
        {filtered.map((conversation) => {
          const group = conversation.isGroup;
          const people = avatarsOf(conversation, me._id);
          const count = conversation.unreadCount ?? 0;
          const typingIds = typingByConversation[conversation._id];
          const typingParticipant = (conversation.participants ?? []).find(
            (participant) => participant._id !== me._id && typingIds?.has(participant._id),
          );
          return (
            <li key={conversation._id}>
              <button
                className={`conversation ${activeId === conversation._id ? "selected" : ""}`}
                onClick={() => onSelect(conversation._id)}
                aria-current={activeId === conversation._id ? "true" : undefined}
              >
                {group ? (
                  <AvatarStack people={people} size={40} />
                ) : (
                  <Avatar
                    src={people[0]?.avatar}
                    size={40}
                    online={isPeerOnline(conversation, me._id, onlineIds)}
                  />
                )}

                <span className="conversation-copy">
                  <span className="conversation-name">
                    {titleOf(conversation, me._id)}
                    {group && (
                      <span className="member-chip">{memberCount(conversation)}</span>
                    )}
                  </span>
                  <span
                    className={`conversation-preview ${typingParticipant ? "is-typing" : ""}`}
                    aria-label={
                      typingParticipant ? `${typingParticipant.name} is typing` : undefined
                    }
                  >
                    {typingParticipant ? "typing…" : previewOf(conversation, me._id)}
                  </span>
                </span>

                <span className="conversation-meta">
                  <time dateTime={conversation.lastActivityAt}>
                    {timeOf(conversation.lastActivityAt)}
                  </time>
                  {count > 0 && <b aria-label={`${count} unread`}>{count}</b>}
                </span>
              </button>
            </li>
          );
        })}

        {filtered.length === 0 && (
          <li className="empty-note">
            {conversations.length === 0
              ? "No conversations yet. Start one with the new message button."
              : `No conversations match “${query}”.`}
          </li>
        )}
      </ul>
    </section>
  );
}
