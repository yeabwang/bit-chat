import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { HTTPSTATUS } from "../config/http.config";
import {
  addMembersSchema,
  conversationIdSchema,
  createConversationSchema,
  renameGroupSchema,
} from "../validators/conversation.validator";
import {
  addMembersService,
  createConversationService,
  getSingleConversationService,
  getUserConversationsService,
  leaveConversationService,
  renameGroupService,
} from "../services/conversation.service";
import {
  emitToConversation,
  emitToUsers,
  joinConversationRoom,
  leaveConversationRoom,
  SOCKET_EVENTS,
} from "../lib/socket";

const participantIdsOf = (conversation: { participants: unknown[] }) =>
  conversation.participants.map((participant) =>
    String((participant as { _id?: unknown })?._id ?? participant),
  );

export const createConversationController = asyncHandler(
  async (req: Request, res: Response) => {
    const body = createConversationSchema.parse(req.body);
    const { conversation, created } = await createConversationService(
      req.user!._id,
      body,
    );

    const conversationId = String(conversation._id);
    const participantIds = participantIdsOf(conversation);

    if (created) {
      joinConversationRoom(participantIds, conversationId);
      emitToUsers(participantIds, SOCKET_EVENTS.CONVERSATION_NEW, {
        conversation,
      });
    }

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
    const conversation = await getSingleConversationService(id, req.user!._id);

    return res.status(HTTPSTATUS.OK).json({
      message: "Conversation retrieved successfully",
      conversation,
    });
  },
);

export const addMembersController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = conversationIdSchema.parse(req.params);
  const body = addMembersSchema.parse(req.body);

  const conversation = await addMembersService(req.user!._id, id, body);

  emitToConversation(id, SOCKET_EVENTS.CONVERSATION_UPDATED, {
    conversation,
  });
  joinConversationRoom(body.members, id);
  emitToUsers(body.members, SOCKET_EVENTS.CONVERSATION_NEW, { conversation });

  return res.status(HTTPSTATUS.OK).json({
    message: "Members added",
    conversation,
  });
});

export const leaveConversationController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = conversationIdSchema.parse(req.params);
    const userId = String(req.user!._id);

    const conversation = await leaveConversationService(req.user!._id, id);

    // the leaver's sockets come out of the room first
    leaveConversationRoom(userId, id);
    emitToConversation(id, SOCKET_EVENTS.CONVERSATION_UPDATED, {
      conversation,
    });
    emitToUsers([userId], SOCKET_EVENTS.CONVERSATION_REMOVED, {
      conversationId: id,
    });

    return res.status(HTTPSTATUS.OK).json({
      message: "Left the conversation",
    });
  },
);

export const renameGroupController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = conversationIdSchema.parse(req.params);
  const body = renameGroupSchema.parse(req.body);

  const conversation = await renameGroupService(req.user!._id, id, body);

  emitToConversation(id, SOCKET_EVENTS.CONVERSATION_UPDATED, {
    conversation,
  });

  return res.status(HTTPSTATUS.OK).json({
    message: "Group renamed",
    conversation,
  });
});
