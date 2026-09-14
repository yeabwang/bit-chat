import { Router } from "express";
import { passportAuthenticateJwt } from "../config/passport.config";
import {
  acceptFriendRequestController,
  getFriendsController,
  getPendingRequestsController,
  removeFriendController,
  removePendingRequestController,
  sendFriendRequestController,
} from "../controllers/friend.controller";

// declining an incoming request and withdrawing one you sent are the same
// operation on the same row, so they share one route
const friendRoutes = Router()
  .use(passportAuthenticateJwt)
  .get("/", getFriendsController)
  .get("/requests", getPendingRequestsController)
  .post("/requests", sendFriendRequestController)
  .post("/requests/:id/accept", acceptFriendRequestController)
  .delete("/requests/:id", removePendingRequestController)
  .delete("/:id", removeFriendController);

export default friendRoutes;
