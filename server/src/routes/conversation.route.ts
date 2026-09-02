import { Router } from "express";
import { passportAuthenticateJwt } from "../config/passport.config";
import {
  createConversationController,
  getSingleConversationController,
  getUserConversationsController,
} from "../controllers/conversation.controller";

const conversationRoutes = Router()
  .use(passportAuthenticateJwt)
  .post("/", createConversationController)
  .get("/", getUserConversationsController)
  .get("/:id", getSingleConversationController);

export default conversationRoutes;
