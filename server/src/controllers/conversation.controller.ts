import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { HTTPSTATUS } from "../config/http.config";
import {
  conversationIdSchema,
  createConversationSchema,
} from "../validators/conversation.validator";
import {
  createConversationService,
  getSingleConversationService,
  getUserConversationsService,
} from "../services/conversation.service";

export const createConversationController = asyncHandler(
  async (req: Request, res: Response) => {
    const body = createConversationSchema.parse(req.body);
    const { conversation, created } = await createConversationService(
      req.user!._id,
      body,
    );

    return res.status(created ? HTTPSTATUS.CREATED : HTTPSTATUS.OK).json({
      message: created ? "Conversation created" : "Conversation already exists",
      conversation,
    });
  },
);

export const getUserConversationsController = asyncHandler(
  async (req: Request, res: Response) => {
    const conversations = await getUserConversationsService(req.user!._id);

    return res.status(HTTPSTATUS.OK).json({
      message: "Conversations retrieved successfully",
      conversations,
    });
  },
);

export const getSingleConversationController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = conversationIdSchema.parse(req.params);
    const { conversation, messages } = await getSingleConversationService(
      id,
      req.user!._id,
    );

    return res.status(HTTPSTATUS.OK).json({
      message: "Conversation retrieved successfully",
      conversation,
      messages,
    });
  },
);
