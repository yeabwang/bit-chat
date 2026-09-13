import { Types } from "mongoose";
import ConversationModel, { ConversationDocument } from "../models/conversation.model";
import MessageModel from "../models/message.model";
import UserModel from "../models/user.model";
import { BadRequestException, NotFoundException } from "../utils/app-error";
import {
  AddMembersSchemaType,
  CreateConversationSchemaType,
  RenameGroupSchemaType,
} from "../validators/conversation.validator";

const PARTICIPANT_FIELDS = "name userName avatar";

export const dmKeyFor = (a: string, b: string) => [a, b].sort().join(":");

const assertUsersExist = async (ids: string[]) => {
  const found = await UserModel.countDocuments({ _id: { $in: ids } });
  if (found !== ids.length) throw new NotFoundException("One or more users do not exist");
};

const populateConversation = (conversation: ConversationDocument) =>
  conversation.populate("participants", PARTICIPANT_FIELDS);

const explainGroupFailure = async (
  conversationId: string,
  userId: Types.ObjectId,
): Promise<never> => {
  const conversation = await ConversationModel.findOne(
    { _id: conversationId, participants: userId },
    { isGroup: 1 },
  );

  if (!conversation)
    throw new NotFoundException("Conversation not found or you are not a participant");
  if (!conversation.isGroup)
    throw new BadRequestException("This action is only available on group conversations");
  throw new BadRequestException("The group has reached its member limit");
};

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

    return {
      conversation: await populateConversation(conversation),
      created: true,
    };
  }

  if (body.participantId === me)
    throw new BadRequestException("You cannot start a conversation with yourself");
  await assertUsersExist([body.participantId]);

  const dmKey = dmKeyFor(me, body.participantId);
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

export const getUserConversationsService = async (userId: Types.ObjectId) => {
  const conversations = await ConversationModel.find({ participants: userId })
    .populate("participants", PARTICIPANT_FIELDS)
    .populate({
      path: "lastMessage",
      populate: { path: "sender", select: PARTICIPANT_FIELDS },
    })
    .sort({ lastActivityAt: -1 })
    .lean();

  // ponytail: one count per conversation. An $lookup aggregate if inboxes get long.
  const key = String(userId);
  return Promise.all(
    conversations.map(async (conversation) => ({
      ...conversation,
      unreadCount: await MessageModel.countDocuments({
        conversationId: conversation._id,
        sender: { $ne: userId },
        createdAt: { $gt: conversation.lastReadAt?.[key] ?? new Date(0) },
      }),
    })),
  );
};

export const markReadService = async (userId: Types.ObjectId, conversationId: string) => {
  const result = await ConversationModel.updateOne(
    { _id: conversationId, participants: userId },
    { $set: { [`lastReadAt.${userId}`]: new Date() } },
  );
  if (result.matchedCount === 0)
    throw new NotFoundException("Conversation not found or you are not a participant");
};

export const getUserConversationIdsService = async (userId: string) => {
  const conversations = await ConversationModel.find(
    { participants: userId },
    { _id: 1 },
  ).lean();
  return conversations.map(({ _id }) => String(_id));
};

export const getSingleConversationService = async (
  conversationId: string,
  userId: Types.ObjectId,
) => {
  const conversation = await ConversationModel.findOne({
    _id: conversationId,
    participants: userId,
  }).populate("participants", PARTICIPANT_FIELDS);

  if (!conversation)
    throw new NotFoundException("Conversation not found or you are not a participant");

  return conversation;
};

export const MAX_GROUP_MEMBERS = 100;

export const addMembersService = async (
  userId: Types.ObjectId,
  conversationId: string,
  body: AddMembersSchemaType,
) => {
  const members = [...new Set(body.members)];
  await assertUsersExist(members);

  const conversation = await ConversationModel.findOneAndUpdate(
    {
      _id: conversationId,
      participants: userId,
      isGroup: true,
      $expr: {
        $lte: [{ $size: "$participants" }, MAX_GROUP_MEMBERS - members.length],
      },
    },
    { $addToSet: { participants: { $each: members } } },
    { new: true },
  ).populate("participants", PARTICIPANT_FIELDS);

  if (!conversation) await explainGroupFailure(conversationId, userId);

  return conversation!;
};

export const leaveConversationService = async (
  userId: Types.ObjectId,
  conversationId: string,
) => {
  const conversation = await ConversationModel.findOneAndUpdate(
    { _id: conversationId, participants: userId, isGroup: true },
    { $pull: { participants: userId } },
    { new: true },
  ).populate("participants", PARTICIPANT_FIELDS);

  if (!conversation) await explainGroupFailure(conversationId, userId);

  // nobody left to read it: drop the group and its history
  if (conversation!.participants?.length === 0) {
    await Promise.all([
      ConversationModel.deleteOne({ _id: conversationId }),
      MessageModel.deleteMany({ conversationId }),
    ]);
  }

  return conversation!;
};

export const renameGroupService = async (
  userId: Types.ObjectId,
  conversationId: string,
  body: RenameGroupSchemaType,
) => {
  const conversation = await ConversationModel.findOneAndUpdate(
    { _id: conversationId, participants: userId, isGroup: true },
    { $set: { groupName: body.groupName } },
    { new: true },
  ).populate("participants", PARTICIPANT_FIELDS);

  if (!conversation) await explainGroupFailure(conversationId, userId);

  return conversation!;
};
