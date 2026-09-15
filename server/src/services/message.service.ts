import { Types } from "mongoose";
import ConversationModel from "../models/conversation.model";
import MessageModel, { MessageDocument } from "../models/message.model";
import { NotFoundException } from "../utils/app-error";
import {
  MessageHistoryQueryType,
  SendMessageSchemaType,
} from "../validators/message.validator";
import { assertFriendsWithAllService } from "./friend.service";

const SENDER_FIELDS = "name userName avatar";

const POPULATE_MESSAGE = [
  { path: "sender", select: SENDER_FIELDS },
  {
    path: "replyTo",
    select: "content sender",
    populate: { path: "sender", select: SENDER_FIELDS },
  },
];

export const sendMessageService = async (
  userId: Types.ObjectId,
  conversationId: string,
  body: SendMessageSchemaType,
) => {
  const conversation = await ConversationModel.findOne({
    _id: conversationId,
    participants: userId,
  });
  if (!conversation)
    throw new NotFoundException("Conversation not found or you are not a participant");

  // Groups are permissioned by membership. Direct messages additionally need
  // a friendship that is still accepted, including conversations created
  // before the friend-only rule existed.
  if (!conversation.isGroup) {
    const otherParticipants = conversation.participants.filter(
      (participant) => String(participant) !== String(userId),
    );
    await assertFriendsWithAllService(userId, otherParticipants);
  }

  if (body.replyToId) {
    const replyTo = await MessageModel.exists({
      _id: body.replyToId,
      conversationId,
    });
    // scoped to this conversation, so a reply cannot quote a message the
    // sender is not entitled to read
    if (!replyTo) throw new NotFoundException("Reply message not found");
  }

  const message = await MessageModel.create({
    conversationId,
    sender: userId,
    content: body.content,
    replyTo: body.replyToId ?? null,
  });
  await message.populate(POPULATE_MESSAGE);

  await ConversationModel.updateOne(
    { _id: conversationId, lastActivityAt: { $lt: message.createdAt } },
    { $set: { lastMessage: message._id, lastActivityAt: message.createdAt } },
  );

  return {
    message,
    participantIds: conversation.participants.map(String),
  };
};

const DEFAULT_PAGE_SIZE = 30;

export const getMessagesService = async (
  userId: Types.ObjectId,
  conversationId: string,
  query: MessageHistoryQueryType,
) => {
  const isParticipant = await ConversationModel.exists({
    _id: conversationId,
    participants: userId,
  });
  if (!isParticipant)
    throw new NotFoundException("Conversation not found or you are not a participant");

  const limit = query.limit ?? DEFAULT_PAGE_SIZE;

  // _id is unique and its leading bytes are a timestamp, so it is a total order
  // over the conversation and a stable cursor.
  const filter = {
    conversationId,
    ...(query.cursor ? { _id: { $lt: query.cursor } } : {}),
  };

  const page = await MessageModel.find(filter)
    .populate(POPULATE_MESSAGE)
    .sort({ _id: -1 })
    .limit(limit + 1);

  const hasMore = page.length > limit;
  const items = hasMore ? page.slice(0, limit) : page;
  const oldest = items.at(-1) as MessageDocument | undefined;

  return {
    // walked backwards from newest, handed back oldest first so the client can
    // prepend a page as-is and keep every list in one order
    items: [...items].reverse(),
    hasMore,
    nextCursor: hasMore && oldest ? String(oldest._id) : null,
  };
};
