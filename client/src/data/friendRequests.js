import { avatarUrl } from "../lib/avatar";

/** Still mock: the server has no friend endpoints yet. */
const iso = (minutesAgo) => new Date(Date.now() - minutesAgo * 60000).toISOString();

const person = (_id, name, userName) => ({ _id, name, userName, avatar: avatarUrl(userName) });

export const friendRequests = {
  incoming: [
    { _id: "fr1", user: person("u2", "Jenny Wilson", "jenny"), createdAt: iso(90) },
    { _id: "fr2", user: person("u3", "Jane Cooper", "janec"), createdAt: iso(600) },
    { _id: "fr3", user: person("u6", "Brooklyn Simmons", "brooklyn"), createdAt: iso(2100) },
  ],
  outgoing: [
    { _id: "fr4", user: person("u9", "Robert Fox", "robert"), createdAt: iso(300) },
  ],
};
