import { Server as HTTPServer } from "http";
import { Server, Socket } from "socket.io";
import { Env } from "../config/env.config";
import { COOKIE_NAME, verifyJwtAuthToken } from "../utils/cookie";
import { findByIdUserService } from "../services/user.service";
import { getUserConversationIdsService } from "../services/conversation.service";
import { addSocket, onlineUserIds, removeSocket } from "./presence";
import ConversationModel from "../models/conversation.model";

export const SOCKET_EVENTS = {
  PRESENCE_SYNC: "presence:sync",
  PRESENCE_ONLINE: "presence:online",
  PRESENCE_OFFLINE: "presence:offline",
  MESSAGE_NEW: "message:new",
  CONVERSATION_NEW: "conversation:new",
  CONVERSATION_UPDATED: "conversation:updated",
  CONVERSATION_REMOVED: "conversation:removed",
  CONVERSATION_READ: "conversation:read",
  FRIENDSHIP_CHANGED: "friendship:changed",
  TYPING_START: "typing:start",
  TYPING_STOP: "typing:stop",
} as const;

export const userRoom = (userId: string) => `user:${userId}`;
export const conversationRoom = (conversationId: string) =>
  `conversation:${conversationId}`;

let io: Server | null = null;

/**
 * Pull one cookie out of a raw Cookie header. Splitting the whole header on "="
 * and taking index 1 only works when exactly one cookie is present; with two it
 * silently returns the wrong value.
 */
export const readCookie = (header: string | undefined, name: string) => {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
};

export const initializeSocket = (httpServer: HTTPServer) => {
  io = new Server(httpServer, {
    cors: { origin: Env.CLIENT_ORIGIN, credentials: true },
  });

  io.use(async (socket, next) => {
    const token = readCookie(socket.handshake.headers.cookie, COOKIE_NAME);
    if (!token) return next(new Error("Unauthorized"));

    let userId: string;
    try {
      ({ userId } = verifyJwtAuthToken(token));
    } catch {
      // an expired or malformed token is a client problem, not a server fault
      return next(new Error("Unauthorized"));
    }

    try {
      const user = userId ? await findByIdUserService(userId) : null;
      if (!user) return next(new Error("Unauthorized"));

      socket.data.userId = String(user._id);
      return next();
    } catch (error) {
      return next(error as Error);
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.data.userId as string;

    if (addSocket(userId, socket.id)) {
      socket.broadcast.emit(SOCKET_EVENTS.PRESENCE_ONLINE, { userId });
    }
    socket.emit(SOCKET_EVENTS.PRESENCE_SYNC, { userIds: onlineUserIds() });

    socket.join(userRoom(userId));

    // Joining every conversation up front
    try {
      for (const conversationId of await getUserConversationIdsService(userId)) {
        socket.join(conversationRoom(conversationId));
      }
    } catch (error) {
      console.error("Could not join conversation rooms", error);
    }

    const forwardTyping = async (
      event: typeof SOCKET_EVENTS.TYPING_START | typeof SOCKET_EVENTS.TYPING_STOP,
      payload: { conversationId?: unknown } | undefined,
    ) => {
      const conversationId = payload?.conversationId;
      if (typeof conversationId !== "string" || !/^[0-9a-f]{24}$/i.test(conversationId))
        return;

      try {
        const isParticipant = await ConversationModel.exists({
          _id: conversationId,
          participants: userId,
        });
        if (!isParticipant) return;

        socket.to(conversationRoom(conversationId)).emit(event, {
          conversationId,
          userId,
        });
      } catch (error) {
        console.error("Could not forward typing state", error);
      }
    };

    socket.on(SOCKET_EVENTS.TYPING_START, (payload) => {
      void forwardTyping(SOCKET_EVENTS.TYPING_START, payload);
    });
    socket.on(SOCKET_EVENTS.TYPING_STOP, (payload) => {
      void forwardTyping(SOCKET_EVENTS.TYPING_STOP, payload);
    });

    socket.on("disconnect", () => {
      if (removeSocket(userId, socket.id)) {
        socket.broadcast.emit(SOCKET_EVENTS.PRESENCE_OFFLINE, { userId });
      }
    });
  });

  return io;
};

const emit = (room: string, event: string, payload: unknown) => {
  io?.to(room).emit(event, payload);
};

export const emitToConversation = (
  conversationId: string,
  event: string,
  payload: unknown,
) => emit(conversationRoom(conversationId), event, payload);

export const emitToUsers = (userIds: string[], event: string, payload: unknown) => {
  for (const userId of userIds) emit(userRoom(userId), event, payload);
};

/** Put every live socket of these users into a conversation room. */
export const joinConversationRoom = (userIds: string[], conversationId: string) => {
  for (const userId of userIds) {
    io?.in(userRoom(userId)).socketsJoin(conversationRoom(conversationId));
  }
};

/**
 a user who leaves a group stops receiving its messages immediatly.
 */
export const leaveConversationRoom = (userId: string, conversationId: string) => {
  io?.in(userRoom(userId)).socketsLeave(conversationRoom(conversationId));
};

// Drop every live socket belonging to a user.
export const disconnectUser = (userId: string) => {
  io?.in(userRoom(userId)).disconnectSockets(true);
};

export const closeSocket = async () => {
  await io?.close();
  io = null;
};

export const getSocketServer = () => io;

export type SocketServer = Server;
export type ChatSocket = Socket;
