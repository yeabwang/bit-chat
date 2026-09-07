import React from "react";
import { ASSETS } from "../../data/assets";
import { contacts, messages } from "../../data/mockData";
import Avatar from "../../components/Avatar/Avatar";
import Img from "../../components/Image/Img";
import "./inbox.css";

export default function ChatPanel({ selected, onHeaderAction, onBack }) {
  const current = contacts[selected] || contacts[0];
  return (
    <section className="chat-panel">
      <header className="chat-header">
        <div className="chat-identity">
          <button className="mobile-back" onClick={onBack} aria-label="Back to inbox">‹</button>
          <Avatar src={current[3]} size={50} />
          <div><h2>{current[0]}</h2><p>20 members, <span>9 online</span></p></div>
        </div>
        <div className="chat-actions">
          <button onClick={onHeaderAction}><span className="fake-switch"><span /></span> Mute</button>
          <button onClick={onHeaderAction}><span className="circle-plus">+</span> Add Friends</button>
          <button onClick={onHeaderAction}><span className="ellipsis">•••</span></button>
        </div>
      </header>
      <div className="message-area">
        <div className="today"><span /><b>Today</b><span /></div>
        {messages.map((m, i) => <div className="message" key={i}><Avatar src={m.avatar} size={30} /><div className="message-body"><div className="message-meta"><strong>{m.name}</strong><time>{m.time}</time></div>{m.image ? <div className="image-message"><Img src={ASSETS.dashboard} /><p>{m.text}</p></div> : <div className="bubble">{m.text}</div>}</div></div>)}
        <div className="message mine"><div className="message-body"><div className="message-meta"><time>13:36 AM</time><strong>You</strong></div><div className="mine-bubble">Wow it looks amazing.</div></div><Avatar src={ASSETS.avatar4} size={30} /></div>
      </div>
      <div className="composer"><textarea placeholder="Write a message..." /><div className="composer-tools"><span /><span /><button>Send</button></div></div>
    </section>
  );
}
