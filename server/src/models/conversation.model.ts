import mongoose, { Document, Schema } from "mongoose";

export interface ConversationDocument extends Document {
  participants: mongoose.Types.ObjectId[];
  lastMessage?: mongoose.Types.ObjectId;
  lastActivityAt?: Date;
  isGroup: boolean;
  groupName?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<ConversationDocument>(
  {
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],

    isGroup: {
      type: Boolean,
      required: true,
      default: false,
    },

    groupName: {
      type: String,
      trim: true,
      default: null,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },

    lastActivityAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

const ConversationModel = mongoose.model<ConversationDocument>(
  "Conversation",
  conversationSchema,
);
export default ConversationModel;
