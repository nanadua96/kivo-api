import { Schema, model } from 'mongoose';

const conversationSchema = new Schema(
  {
    title: {
      type: String,
      maxLength: 100,
    },

    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    pinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

export const Conversation = model('Conversation', conversationSchema);
