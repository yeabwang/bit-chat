import React from "react";
import { ASSETS } from "../../data/assets";
import Avatar from "../../components/Avatar/Avatar";
import "./friends.css";

export default function FriendsScreen() {
  return <section className="center-screen">
    <div className="friends-card">
      <h1>Friend requests</h1>
      <div className="request-row">
        <Avatar src={ASSETS.avatar1} size={50} online />
        <strong>Jenny Wilson</strong>
        <div>
          <button className="accept">Accept</button>
          <button className="decline">Decline</button>
        </div>
      </div>
      <div className="request-row">
        <Avatar src={ASSETS.avatar2} size={50} />
        <strong>Jane Cooper</strong>
        <div>
          <button className="accept">Accept</button>
          <button className="decline">Decline</button>
        </div>
      </div>
    </div>
  </section>;
}
