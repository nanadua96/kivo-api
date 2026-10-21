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
      default: '000000000000000000000000',
    },

    guestSessionId: {
      type: String,
      //! USE cuid2 package to validate
    },

    messages: [{ role: String, text: String, timestamp: Date }],
  },
  {
    timestamps: true,
  },
);

export const Conversation = model('Conversation', conversationSchema);
