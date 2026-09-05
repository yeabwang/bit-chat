import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { HTTPSTATUS } from "../config/http.config";
import { conversationIdSchema } from "../validators/conversation.validator";
import {
  messageHistoryQuerySchema,
  sendMessageSchema,
} from "../validators/message.validator";
import { getMessagesService, sendMessageService } from "../services/message.service";
import { emitToConversation, SOCKET_EVENTS } from "../lib/socket";

export const sendMessageController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = conversationIdSchema.parse(req.params);
  const body = sendMessageSchema.parse(req.body);

  const { message } = await sendMessageService(req.user!._id, id, body);

  emitToConversation(id, SOCKET_EVENTS.MESSAGE_NEW, { message });

  return res.status(HTTPSTATUS.CREATED).json({
    message: "Message sent",
    newMessage: message,
  });
});

export const getMessagesController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = conversationIdSchema.parse(req.params);
  const query = messageHistoryQuerySchema.parse(req.query);

  const page = await getMessagesService(req.user!._id, id, query);

  return res.status(HTTPSTATUS.OK).json({
    message: "Messages retrieved successfully",
    ...page,
  });
});
