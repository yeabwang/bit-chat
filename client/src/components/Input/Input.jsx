import React from "react";

export default function Input({ className = "", ...props }) {
  return <input className={className} {...props} />;
}
