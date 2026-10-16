import mongoose, { SchemaType, SchemaTypes, Schema } from 'mongoose';

const historySchema = new mongoose.Schema(
  {
    title: String,

    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },

    messages: [{ role: String, text: String, timestamp: Date }],
  },
  { timestamps: true },
);

export const History = mongoose.model('History', historySchema);
