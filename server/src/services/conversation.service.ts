import { Types } from "mongoose";
import ConversationModel, { ConversationDocument } from "../models/conversation.model";
import MessageModel from "../models/message.model";
import UserModel from "../models/user.model";
import { BadRequestException, NotFoundException } from "../utils/app-error";
import { CreateConversationSchemaType } from "../validators/conversation.validator";

const PARTICIPANT_FIELDS = "name userName avatar";

export const dmKeyFor = (a: string, b: string) => [a, b].sort().join(":");

const assertUsersExist = async (ids: string[]) => {
  const found = await UserModel.countDocuments({ _id: { $in: ids } });
  if (found !== ids.length) throw new NotFoundException("One or more users do not exist");
};

const populateConversation = (conversation: ConversationDocument) =>
  conversation.populate("participants", PARTICIPANT_FIELDS);

export const createConversationService = async (
  userId: Types.ObjectId,
  body: CreateConversationSchemaType,
): Promise<{ conversation: ConversationDocument; created: boolean }> => {
  const me = String(userId);

  if (body.isGroup) {
    // the creator is a member by definition, and cannot be listed twice
    const members = [...new Set(body.participants)].filter((id) => id !== me);
    if (members.length < 2)
      throw new BadRequestException("A group needs at least two other members");
    await assertUsersExist(members);

    const conversation = await ConversationModel.create({
      participants: [me, ...members],
      isGroup: true,
      groupName: body.groupName,
      createdBy: me,
    });

    return { conversation: await populateConversation(conversation), created: true };
  }

  if (body.participantId === me)
    throw new BadRequestException("You cannot start a conversation with yourself");
  await assertUsersExist([body.participantId]);

  const dmKey = dmKeyFor(me, body.participantId);

  // unique index on dmKey is what stops two concurrent requests opening a second DM for the pair
  const result = await ConversationModel.findOneAndUpdate(
    { dmKey },
    {
      $setOnInsert: {
        participants: [me, body.participantId],
        isGroup: false,
        createdBy: me,
        dmKey,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      includeResultMetadata: true,
    },
  );

  const conversation = result.value;
  if (!conversation) throw new BadRequestException("Could not open the conversation");

  return {
    conversation: await populateConversation(conversation),
    created: !result.lastErrorObject?.updatedExisting,
  };
};

export const getUserConversationsService = (userId: Types.ObjectId) =>
  ConversationModel.find({ participants: userId })
    .populate("participants", PARTICIPANT_FIELDS)
    .populate({
      path: "lastMessage",
      populate: { path: "sender", select: PARTICIPANT_FIELDS },
    })
    .sort({ lastActivityAt: -1 });

export const getSingleConversationService = async (
  conversationId: string,
  userId: Types.ObjectId,
) => {
  const conversation = await ConversationModel.findOne({
    _id: conversationId,
    participants: userId,
  }).populate("participants", PARTICIPANT_FIELDS);

  // non-participant cannot tell the conversation exists
  if (!conversation)
    throw new NotFoundException("Conversation not found or you are not a participant");

  const messages = await MessageModel.find({ conversationId })
    .populate("sender", PARTICIPANT_FIELDS)
    .populate({
      path: "replyTo",
      select: "content image sender",
      populate: { path: "sender", select: PARTICIPANT_FIELDS },
    })
    .sort({ createdAt: 1 });

  return { conversation, messages };
};

export const validateConversationParticipant = async (
  conversationId: string,
  userId: Types.ObjectId,
) => {
  const conversation = await ConversationModel.findOne({
    _id: conversationId,
    participants: userId,
  });
  if (!conversation)
    throw new NotFoundException("Conversation not found or you are not a participant");
  return conversation;
};
