import React from "react";
import Img from "../Image/Img";
import "../common.css";

export default function Avatar({ src, size = 40, online = false }) {
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      <Img src={src} />
      {online && <i className="online-dot" />}
    </span>
  );
}
