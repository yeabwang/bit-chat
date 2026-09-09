import "../common.css";

export default function Icon({ src, size = 20 }) {
  return (
    <span
      className="icon"
      aria-hidden="true"
      style={{ width: size, height: size, "--icon-src": `url(${src})` }}
    />
  );
}
