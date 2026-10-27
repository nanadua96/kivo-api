import { Schema, model } from 'mongoose';

const messageSchema = new Schema(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },

    role: {
      type: String,
      enum: ['system', 'user', 'assistant'],
      required: true,
    },

    content: {
      type: String,
      default: '',
    },

    status: {
      type: String,
      enum: ['pending', 'streaming', 'complete', 'error', 'cancelled'],
      default: 'complete',
    },
  },
  {
    timestamps: true,
  },
);

export const Message = model('Message', messageSchema);
