import React from "react";
import Avatar from "../Avatar/Avatar";

export default function ConversationItem({ name, preview, time, avatar, online, unread, selected, onClick, trailing }) {
  return <button className={`conversation ${selected ? "selected" : ""}`} onClick={onClick}>
    <Avatar src={avatar} size={40} online={online} />
    <span className="conversation-copy"><span className="conversation-name">{name}</span><span className={online ? "typing" : "conversation-preview"}>{preview}</span></span>
    <span className="conversation-meta"><span>{time}</span>{trailing ?? (unread > 0 ? <b>{unread}</b> : null)}</span>
  </button>;
}
