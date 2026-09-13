import mongoose, { Document, Schema } from "mongoose";

export type FriendshipStatus = "pending" | "accepted";

export interface FriendshipDocument extends Document {
  requester: mongoose.Types.ObjectId;
  recipient: mongoose.Types.ObjectId;
  pairKey: string;
  status: FriendshipStatus;
  createdAt: Date;
  updatedAt: Date;
}

const friendshipSchema = new Schema<FriendshipDocument>(
  {
    requester: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // the two ids sorted and joined, so the pair has one identity regardless of
    // who asked first. Same idea as dmKey on the conversation model.
    pairKey: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "accepted"],
      required: true,
      default: "pending",
    },
  },
  {
    timestamps: true,
  },
);

// One row per pair, whichever direction it was created in. This is what makes
// the simultaneous-request case safe: two people who request each other at the
// same moment cannot end up with two rows that each think they are the only one.
friendshipSchema.index({ pairKey: 1 }, { unique: true });

// the two list queries: my incoming pending, and my accepted friends
friendshipSchema.index({ recipient: 1, status: 1 });
friendshipSchema.index({ requester: 1, status: 1 });

const FriendshipModel = mongoose.model<FriendshipDocument>(
  "Friendship",
  friendshipSchema,
);

export default FriendshipModel;
