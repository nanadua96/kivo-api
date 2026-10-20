import { Schema, model } from 'mongoose';

const conversationSchema = new Schema(
  {
    title: String,

    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: '000000000000000000000000',
    },

    tempSessionId: {
      type: String,
      unique: true,
    },

    messages: [{ role: String, text: String, timestamp: Date }],
  },
  { timestamps: true },
);

export const Conversation = model('Conversation', conversationSchema);
