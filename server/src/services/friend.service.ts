import { Types } from "mongoose";
import FriendshipModel, { FriendshipDocument } from "../models/friendship.model";
import UserModel from "../models/user.model";
import { BadRequestException, NotFoundException } from "../utils/app-error";
import { SendFriendRequestSchemaType } from "../validators/friend.validator";

const USER_FIELDS = "name userName avatar";

export const pairKeyFor = (a: string, b: string) => [a, b].sort().join(":");

/**
 * Guard every action that addresses specific people. One query covers the
 * whole set, and accepted is part of the query so pending requests never grant
 * messaging or group access.
 */
export const assertFriendsWithAllService = async (
  userId: Types.ObjectId,
  targetIds: Array<string | Types.ObjectId>,
) => {
  const me = String(userId);
  const pairKeys = [
    ...new Set(
      targetIds
        .map(String)
        .filter((targetId) => targetId !== me)
        .map((targetId) => pairKeyFor(me, targetId)),
    ),
  ];

  if (pairKeys.length === 0) return;

  const accepted = await FriendshipModel.countDocuments({
    pairKey: { $in: pairKeys },
    status: "accepted",
  });

  if (accepted !== pairKeys.length)
    throw new BadRequestException("You can only message and add accepted friends");
};

const assertUserExists = async (id: string) => {
  const found = await UserModel.countDocuments({ _id: id });
  if (found !== 1) throw new NotFoundException("That user does not exist");
};

/**
 * The conditional update matched nothing. Work out which precondition failed so
 * the caller gets a useful error instead of a bare 404. Same shape as
 * explainGroupFailure in the conversation service.
 */
const explainRequestFailure = async (
  friendshipId: string,
  userId: Types.ObjectId,
): Promise<never> => {
  const friendship = await FriendshipModel.findById(friendshipId, {
    requester: 1,
    recipient: 1,
    status: 1,
  });

  if (!friendship) throw new NotFoundException("Friend request not found");

  const involved =
    String(friendship.requester) === String(userId) ||
    String(friendship.recipient) === String(userId);

  // someone else's request: same error as one that does not exist, so ids
  // cannot be probed to learn who has asked whom
  if (!involved) throw new NotFoundException("Friend request not found");

  if (friendship.status === "accepted")
    throw new BadRequestException("You are already friends");

  throw new BadRequestException("Only the person who received it can accept it");
};

export const sendFriendRequestService = async (
  userId: Types.ObjectId,
  { userId: targetId }: SendFriendRequestSchemaType,
): Promise<{ friendship: FriendshipDocument; created: boolean }> => {
  const me = String(userId);

  if (targetId === me)
    throw new BadRequestException("You cannot add yourself as a friend");

  await assertUserExists(targetId);

  const pairKey = pairKeyFor(me, targetId);

  // Upsert on the pair rather than insert-if-absent. A check followed by an
  // insert leaves a window where two simultaneous requests both see nothing and
  // both write; the unique index on pairKey means only one document can exist,
  // and the upsert lets the loser read what the winner wrote instead of failing.
  const result = await FriendshipModel.findOneAndUpdate(
    { pairKey },
    {
      $setOnInsert: {
        requester: me,
        recipient: targetId,
        pairKey,
        status: "pending",
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      includeResultMetadata: true,
    },
  );

  const friendship = result.value;
  if (!friendship) throw new BadRequestException("Could not send the friend request");

  if (!result.lastErrorObject?.updatedExisting) return { friendship, created: true };

  // A row already existed. Three cases, and only one of them is an error.
  if (friendship.status === "accepted")
    throw new BadRequestException("You are already friends");

  if (String(friendship.requester) === me)
    throw new BadRequestException("You have already sent them a request");

  // They asked first and we are now asking back, which is consent from both
  // sides. Accept it rather than making them go and press the button. The
  // filter carries the status, so if their request is accepted concurrently by
  // some other path this matches nothing and we fall through to the explainer.
  const accepted = await FriendshipModel.findOneAndUpdate(
    { _id: friendship._id, status: "pending", recipient: userId },
    { $set: { status: "accepted" } },
    { new: true },
  );

  if (!accepted) await explainRequestFailure(String(friendship._id), userId);

  return { friendship: accepted!, created: false };
};

export const acceptFriendRequestService = async (
  userId: Types.ObjectId,
  friendshipId: string,
) => {
  // recipient and status both live in the filter: only the person who received
  // a still-pending request can accept it, decided in the same operation that
  // writes, so two taps cannot both succeed
  const friendship = await FriendshipModel.findOneAndUpdate(
    { _id: friendshipId, recipient: userId, status: "pending" },
    { $set: { status: "accepted" } },
    { new: true },
  );

  if (!friendship) await explainRequestFailure(friendshipId, userId);

  return friendship!;
};

/**
 * Declining an incoming request and withdrawing one you sent are the same
 * operation: remove the pending row. Deleting rather than storing a "declined"
 * state means the pair can try again later, and keeps the unique index from
 * blocking a future request.
 */
export const removePendingRequestService = async (
  userId: Types.ObjectId,
  friendshipId: string,
) => {
  const friendship = await FriendshipModel.findOneAndDelete({
    _id: friendshipId,
    status: "pending",
    $or: [{ requester: userId }, { recipient: userId }],
  });

  if (!friendship) await explainRequestFailure(friendshipId, userId);

  return friendship!;
};

export const removeFriendService = async (
  userId: Types.ObjectId,
  friendshipId: string,
) => {
  const friendship = await FriendshipModel.findOneAndDelete({
    _id: friendshipId,
    status: "accepted",
    $or: [{ requester: userId }, { recipient: userId }],
  });

  if (!friendship) await explainRequestFailure(friendshipId, userId);

  return friendship!;
};

/**
 * Both pending lists in one query, split by direction.
 *
 * The client renders each row as the other person, so the shape it gets is
 * { _id, user }, never the raw requester/recipient pair.
 */
export const getPendingRequestsService = async (userId: Types.ObjectId) => {
  const rows = await FriendshipModel.find({
    status: "pending",
    $or: [{ requester: userId }, { recipient: userId }],
  })
    .populate("requester", USER_FIELDS)
    .populate("recipient", USER_FIELDS)
    .sort({ createdAt: -1 });

  const me = String(userId);
  const incoming = [];
  const outgoing = [];

  for (const row of rows) {
    const iSent = String(row.requester._id ?? row.requester) === me;
    const view = {
      _id: row._id,
      user: iSent ? row.recipient : row.requester,
      createdAt: row.createdAt,
    };
    if (iSent) outgoing.push(view);
    else incoming.push(view);
  }

  return { incoming, outgoing };
};

export const getFriendsService = async (userId: Types.ObjectId) => {
  const rows = await FriendshipModel.find({
    status: "accepted",
    $or: [{ requester: userId }, { recipient: userId }],
  })
    .populate("requester", USER_FIELDS)
    .populate("recipient", USER_FIELDS)
    .sort({ updatedAt: -1 });

  const me = String(userId);

  return rows.map((row) => ({
    _id: row._id,
    user:
      String(row.requester._id ?? row.requester) === me ? row.recipient : row.requester,
  }));
};
