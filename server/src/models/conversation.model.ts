import mongoose, { Document, Schema } from "mongoose";

export interface ConversationDocument extends Document {
  participants: mongoose.Types.ObjectId[];
  lastMessage?: mongoose.Types.ObjectId | null;
  lastActivityAt: Date;
  isGroup: boolean;
  groupName?: string | null;
  dmKey?: string;
  createdBy: mongoose.Types.ObjectId;
  // user id -> when that user last opened the thread; unread = messages after it
  lastReadAt: Map<string, Date>;
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

    // the two participant ids of a DM, sorted and joined. only constrains DMs.
    dmKey: {
      type: String,
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

    lastReadAt: {
      type: Map,
      of: Date,
      default: {},
    },

    // new, empty conversation sorts to the top; the message layer bumps it on every send.
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

conversationSchema.index(
  { dmKey: 1 },
  { unique: true, partialFilterExpression: { dmKey: { $type: "string" } } },
);

conversationSchema.index({ participants: 1, lastActivityAt: -1 });

const ConversationModel = mongoose.model<ConversationDocument>(
  "Conversation",
  conversationSchema,
);
export default ConversationModel;
