import React, { useMemo } from "react";
import { ASSETS } from "../../data/assets";
import { contacts } from "../../data/mockData";
import Avatar from "../../components/Avatar/Avatar";
import Icon from "../../components/Icon/Icon";
import "./inbox.css";

export default function ConversationList({ selected, setSelected, query, setQuery, onBack }) {
  const filtered = useMemo(() => contacts.filter(([name, preview]) => `${name} ${preview}`.toLowerCase().includes(query.toLowerCase())), [query]);
  return (
    <section className="conversation-panel">
      <header className="inbox-header">
        <div><div className="title-row"><h2>Inbox</h2><Icon src={ASSETS.edit} /></div><div className="muted tiny">125 message <span className="dot-sep" /> 5 unread</div></div>
      </header>
      <div className="search-box"><Icon src={ASSETS.search} /><input placeholder="Search..." value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      <div className="online-header"><strong>Online Now</strong><button>All</button></div>
      <div className="online-row">{contacts.slice(0, 4).map((c, i) => <Avatar key={i} src={c[3]} size={40} online />)}</div>
      <div className="conversation-list">
        {filtered.map(([name, preview, time, avatar, online, unread], i) => (
          <button key={`${name}-${i}`} className={`conversation ${selected === i ? "selected" : ""}`} onClick={() => { setSelected(i); onBack?.(); }}>
            <Avatar src={avatar} size={40} online={online} />
            <span className="conversation-copy"><span className="conversation-name">{name}</span><span className={online ? "typing" : "conversation-preview"}>{preview}</span></span>
            <span className="conversation-meta"><span>{time}</span>{unread > 0 ? <b>{unread}</b> : <Icon src={ASSETS.check} size={16} />}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
