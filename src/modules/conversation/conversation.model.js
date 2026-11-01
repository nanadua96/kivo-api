import { Schema, model } from 'mongoose';

const conversationSchema = new Schema(
  {
    title: {
      type: String,
      maxLength: 100,
      default: 'New chat',
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

    model: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ['active', 'deleted'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  },
);

export const Conversation = model('Conversation', conversationSchema);
