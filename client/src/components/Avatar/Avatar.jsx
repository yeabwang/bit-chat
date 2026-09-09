import "../common.css";

export default function Avatar({ src, size = 40, online = false }) {
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      <img src={src} alt="" draggable="false" />
      {online && <i className="online-dot" />}
    </span>
  );
}
