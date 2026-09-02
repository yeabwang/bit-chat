import { z } from "zod";

// malformed id never reaches mongoose
export const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{24}$/i, "Must be a valid id");

export const createConversationSchema = z.discriminatedUnion("isGroup", [
  z.object({
    isGroup: z.literal(false),
    participantId: objectIdSchema,
  }),
  z.object({
    isGroup: z.literal(true),
    groupName: z
      .string()
      .trim()
      .min(1, "Group name is required")
      .max(60, "Group name must be at most 60 characters"),
    participants: z
      .array(objectIdSchema)
      .min(2, "A group needs at least two other members"),
  }),
]);

export const conversationIdSchema = z.object({
  id: objectIdSchema,
});

export type CreateConversationSchemaType = z.infer<typeof createConversationSchema>;
