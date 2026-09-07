import React from "react";

export default function MessageBubble({ children, mine = false, className = "" }) {
  return <div className={`${mine ? "mine-bubble" : "bubble"} ${className}`}>{children}</div>;
}
