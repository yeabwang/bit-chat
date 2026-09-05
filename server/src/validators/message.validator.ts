import { z } from "zod";
import { objectIdSchema } from "./conversation.validator";

export const sendMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "A message cannot be empty")
    .max(4000, "A message must be at most 4000 characters"),
  replyToId: objectIdSchema.optional(),
});

export const messageHistoryQuerySchema = z.object({
  // query strings arrive as text; coerce, then hold to a sane page size
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: objectIdSchema.optional(),
});

export type SendMessageSchemaType = z.infer<typeof sendMessageSchema>;
export type MessageHistoryQueryType = z.infer<typeof messageHistoryQuerySchema>;
