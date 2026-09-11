/**
 *  avatars from DiceBear: the same seed always renders the same face
 */
const STYLE = "lorelei";

export const avatarUrl = (seed) =>
  `https://api.dicebear.com/10.x/${STYLE}/svg?seed=${encodeURIComponent(seed)}`;

/** Stored avatar, or a generated one for accounts that have none. */
export const avatarFor = (user) =>
  user?.avatar ?? avatarUrl(user?.userName ?? user?._id ?? "anonymous");

/** Fill in a generated avatar so components can render `user.avatar` directly. */
export const withAvatar = (user) =>
  user && !user.avatar ? { ...user, avatar: avatarFor(user) } : user;
