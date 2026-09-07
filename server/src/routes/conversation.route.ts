import { Router } from "express";
import { passportAuthenticateJwt } from "../config/passport.config";
import {
  addMembersController,
  createConversationController,
  getSingleConversationController,
  getUserConversationsController,
  leaveConversationController,
  renameGroupController,
} from "../controllers/conversation.controller";
import {
  getMessagesController,
  sendMessageController,
} from "../controllers/message.controller";

// messages are nested under their conversation: membership is checked on the
// same id that scopes the query, and the history cursor belongs to the thread
const conversationRoutes = Router()
  .use(passportAuthenticateJwt)
  .post("/", createConversationController)
  .get("/", getUserConversationsController)
  .get("/:id", getSingleConversationController)
  .patch("/:id", renameGroupController)
  .post("/:id/members", addMembersController)
  .delete("/:id/members/me", leaveConversationController)
  .get("/:id/messages", getMessagesController)
  .post("/:id/messages", sendMessageController);

export default conversationRoutes;
