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
      immutable: true,
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
      immutable: true,
    },

    rating: {
      type: String,
      enum: ['up', 'down'],
    },

    sequence: {
      type: Number,
      default: 1,
    },

    status: {
      type: String,
      enum: ['pending', 'streaming', 'complete', 'error', 'cancelled'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  },
);

export const Message = model('Message', messageSchema);
