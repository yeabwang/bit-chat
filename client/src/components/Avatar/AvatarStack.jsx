import Avatar from "./Avatar";
import "../common.css";

export default function AvatarStack({ people = [], size = 40 }) {
  const shown = people.slice(0, 2);
  const inner = Math.round(size * 0.58);

  if (shown.length < 2) {
    return <Avatar src={shown[0]?.avatar} size={size} />;
  }

  return (
    <span className="avatar-stack" style={{ width: size, height: size }} aria-hidden="true">
      {shown.map((person, index) => (
        <span key={person._id} className={`stack-slot slot-${index}`}>
          <Avatar src={person.avatar} size={inner} />
        </span>
      ))}
    </span>
  );
}
