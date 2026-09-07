import React from "react";
import { contacts } from "../../data/mockData";
import Avatar from "../Avatar/Avatar";
import "./modal.css";

export default function Modal({ type, close }) {
  if (!type) return null;
  return <div className="modal-backdrop" onClick={close}>
    <div className="modal" onClick={(e) => e.stopPropagation()}>
      <button className="modal-x" onClick={close}>×</button>{type === "new" && <><h2>New Message</h2><input placeholder="Search by username" />
      <button className="modal-primary" onClick={close}>Search</button></>}{type === "group" && <><div className="modal-title-row"><button onClick={close}>Cancel</button><h2>New Group</h2><button onClick={close}>Create</button></div><label>Group Name<input placeholder="Group name" /></label><div className="member-list">{contacts.slice(0, 4).map((c, i) => <div key={i}><Avatar src={c[3]} size={50} /><span>{c[0]}</span><span className="check-circle">✓</span></div>)}</div></>}</div></div>;
}
