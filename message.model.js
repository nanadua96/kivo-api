import { Schema, model } from 'mongoose';

const messageSchema = new Schema(
  {
    role: {
      type: String,
    },

    text: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

export const Message = model('Message', messageSchema);
