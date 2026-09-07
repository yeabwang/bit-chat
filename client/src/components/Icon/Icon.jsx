import React from "react";
import Img from "../Image/Img";
import "../common.css";

export default function Icon({ src, size = 20 }) {
  return <span className="icon" style={{ width: size, height: size }}><Img src={src} /></span>;
}
