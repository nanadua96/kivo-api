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

    model: {
      type: String,
      required: true,
    },

    //     {
    //   "_id": ObjectId("64a2f9b..."),
    //   "userId": ObjectId("..."),
    //   "title": "Debugging a React useEffect loop",
    //   "model": "gpt-4o",
    //   "systemPrompt": "You are an expert full-stack developer.",
    //   "metadata": {
    //     "totalTokensUsed": 1420,
    //     "tags": ["react", "frontend"]
    //   },
    //   "isArchived": false,
    //   "createdAt": ISODate("2026-06-06T10:15:00Z"),
    //   "updatedAt": ISODate("2026-06-06T10:30:00Z")
    // }
  },
  {
    timestamps: true,
  },
);

export const Conversation = model('Conversation', conversationSchema);
