import { Request, Response } from "express";
import { HTTPSTATUS } from "../config/http.config";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import {
  acceptFriendRequestService,
  getFriendsService,
  getPendingRequestsService,
  removeFriendService,
  removePendingRequestService,
  sendFriendRequestService,
} from "../services/friend.service";
import {
  friendshipParamsSchema,
  sendFriendRequestSchema,
} from "../validators/friend.validator";
import { emitToUsers, SOCKET_EVENTS } from "../lib/socket";

const notifyFriendshipChanged = (friendship: {
  requester: unknown;
  recipient: unknown;
}) => {
  emitToUsers(
    [String(friendship.requester), String(friendship.recipient)],
    SOCKET_EVENTS.FRIENDSHIP_CHANGED,
    {},
  );
};

export const sendFriendRequestController = asyncHandler(
  async (req: Request, res: Response) => {
    const body = sendFriendRequestSchema.parse(req.body);
    const { friendship, created } = await sendFriendRequestService(req.user!._id, body);
    notifyFriendshipChanged(friendship);

    // 201 for a new pending request, 200 when their existing request was
    // accepted instead — both are successes from the caller's point of view
    return res.status(created ? HTTPSTATUS.CREATED : HTTPSTATUS.OK).json({
      message: created ? "Friend request sent" : "You are now friends",
      data: friendship,
    });
  },
);

export const acceptFriendRequestController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = friendshipParamsSchema.parse(req.params);
    const friendship = await acceptFriendRequestService(req.user!._id, id);
    notifyFriendshipChanged(friendship);

    return res
      .status(HTTPSTATUS.OK)
      .json({ message: "Friend request accepted", data: friendship });
  },
);

export const removePendingRequestController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = friendshipParamsSchema.parse(req.params);
    const friendship = await removePendingRequestService(req.user!._id, id);
    notifyFriendshipChanged(friendship);

    return res.status(HTTPSTATUS.OK).json({ message: "Request removed" });
  },
);

export const removeFriendController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = friendshipParamsSchema.parse(req.params);
    const friendship = await removeFriendService(req.user!._id, id);
    notifyFriendshipChanged(friendship);

    return res.status(HTTPSTATUS.OK).json({ message: "Friend removed" });
  },
);

export const getPendingRequestsController = asyncHandler(
  async (req: Request, res: Response) => {
    const requests = await getPendingRequestsService(req.user!._id);

    return res
      .status(HTTPSTATUS.OK)
      .json({ message: "Friend requests fetched", ...requests });
  },
);

export const getFriendsController = asyncHandler(async (req: Request, res: Response) => {
  const friends = await getFriendsService(req.user!._id);

  return res.status(HTTPSTATUS.OK).json({ message: "Friends fetched", data: friends });
});
