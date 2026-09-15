import { useEffect, useMemo, useRef, useState } from "react";
import Avatar from "../../components/Avatar/Avatar";
import AvatarStack from "../../components/Avatar/AvatarStack";
import Icon from "../../components/Icon/Icon";
import { avatarsOf, timeOf, titleOf } from "../../data/conversation";
import "./notifications.css";

export default function NotificationsMenu({
  conversations,
  requests,
  me,
  onOpenConversation,
  onOpenRequests,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const notifications = useMemo(() => {
    const messages = conversations
      .filter((conversation) => (conversation.unreadCount ?? 0) > 0)
      .map((conversation) => ({
        id: `message-${conversation._id}`,
        kind: "message",
        at: conversation.lastActivityAt,
        conversation,
      }));
    const friendRequests = (requests.incoming ?? []).map((request) => ({
      id: `friend-${request._id}`,
      kind: "friend",
      at: request.createdAt,
      request,
    }));

    return [...messages, ...friendRequests].sort(
      (a, b) => new Date(b.at ?? 0) - new Date(a.at ?? 0),
    );
  }, [conversations, requests]);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const count = notifications.length;
  const chooseConversation = (conversationId) => {
    setOpen(false);
    onOpenConversation(conversationId);
  };
  const chooseRequests = () => {
    setOpen(false);
    onOpenRequests();
  };

  return (
    <div className="notification-center" ref={rootRef}>
      <button
        type="button"
        className={`notification-bell ${open ? "active" : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-label={`Notifications${count ? `, ${count} new` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Icon name="notification" size={20} />
        {count > 0 && (
          <span className="notification-badge" aria-hidden="true">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <section className="notification-popover" role="dialog" aria-label="Notifications">
          <header className="notification-popover-head">
            <h2>Notifications</h2>
          </header>

          <ul className="notification-list">
            {notifications.map((notification) => {
              if (notification.kind === "friend") {
                const { request } = notification;
                return (
                  <li key={notification.id}>
                    <button className="notification-row" onClick={chooseRequests}>
                      <span className="notification-avatar-wrap">
                        <Avatar src={request.user.avatar} size={42} />
                        <i className="notification-dot" aria-hidden="true" />
                      </span>
                      <span className="notification-copy">
                        <strong>{request.user.name}</strong>
                        <span>Sent you a friend request</span>
                      </span>
                      <time dateTime={request.createdAt}>{timeOf(request.createdAt)}</time>
                    </button>
                  </li>
                );
              }

              const { conversation } = notification;
              const people = avatarsOf(conversation, me._id);
              const unread = conversation.unreadCount ?? 0;
              return (
                <li key={notification.id}>
                  <button
                    className="notification-row"
                    onClick={() => chooseConversation(conversation._id)}
                  >
                    <span className="notification-avatar-wrap">
                      {conversation.isGroup ? (
                        <AvatarStack people={people} size={42} />
                      ) : (
                        <Avatar src={people[0]?.avatar} size={42} />
                      )}
                      <i className="notification-dot" aria-hidden="true" />
                    </span>
                    <span className="notification-copy">
                      <strong>{titleOf(conversation, me._id)}</strong>
                      <span>
                        {unread} unread message{unread === 1 ? "" : "s"}
                      </span>
                    </span>
                    <time dateTime={conversation.lastActivityAt}>
                      {timeOf(conversation.lastActivityAt)}
                    </time>
                  </button>
                </li>
              );
            })}

            {notifications.length === 0 && (
              <li className="notifications-empty">
                No notifications
              </li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
