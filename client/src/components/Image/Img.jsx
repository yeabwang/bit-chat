import React from "react";

export default function Img({ src, alt = "" }) {
  return <img src={src} alt={alt} draggable="false" />;
}
