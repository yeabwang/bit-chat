import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { HTTPSTATUS } from "../config/http.config";
import { getUsersService } from "../services/user.service";
import { isOnline } from "../lib/presence";

export const getUsersController = asyncHandler(async (req: Request, res: Response) => {
  const users = await getUsersService(req.user!._id);

  // persisted flag would survive a crash and leave everyone marked online
  const withPresence = users.map((user) => ({
    ...user.toJSON(),
    isOnline: isOnline(String(user._id)),
  }));

  return res.status(HTTPSTATUS.OK).json({
    message: "Users retrieved successfully",
    users: withPresence,
  });
});
