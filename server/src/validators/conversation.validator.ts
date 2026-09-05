import { z } from "zod";

export const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{24}$/i, "Must be a valid id");

export const groupNameSchema = z
  .string()
  .trim()
  .min(1, "Group name is required")
  .max(60, "Group name must be at most 60 characters");

// isGroup is required
export const createConversationSchema = z.discriminatedUnion("isGroup", [
  z.object({
    isGroup: z.literal(false),
    participantId: objectIdSchema,
  }),
  z.object({
    isGroup: z.literal(true),
    groupName: groupNameSchema,
    participants: z
      .array(objectIdSchema)
      .min(2, "A group needs at least two other members"),
  }),
]);

export const conversationIdSchema = z.object({
  id: objectIdSchema,
});

export const addMembersSchema = z.object({
  members: z
    .array(objectIdSchema)
    .min(1, "Name at least one member to add")
    .max(50, "Add at most 50 members at a time"),
});

export const renameGroupSchema = z.object({
  groupName: groupNameSchema,
});

export type CreateConversationSchemaType = z.infer<typeof createConversationSchema>;
export type AddMembersSchemaType = z.infer<typeof addMembersSchema>;
export type RenameGroupSchemaType = z.infer<typeof renameGroupSchema>;
