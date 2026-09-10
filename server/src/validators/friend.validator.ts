import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Not a valid id");

export const sendFriendRequestSchema = z.object({
  userId: objectId,
});

export const friendshipParamsSchema = z.object({
  id: objectId,
});

export type SendFriendRequestSchemaType = z.infer<typeof sendFriendRequestSchema>;

export type FriendshipParamsType = z.infer<typeof friendshipParamsSchema>;
