import { model, Schema } from 'mongoose';

const messageSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },

    conversation: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },

    role: {
      type: String,
      enum: ['system', 'user', 'assistant'],
      required: true,
      immutable: true,
    },

    content: {
      type: String,
      default: '',
    },

    model: {
      type: String,
    },

    rating: {
      type: String,
      enum: ['up', 'down'],
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
