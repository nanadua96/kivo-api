import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      default: null,
      index: true,
    },

    filename: {
      type: String,
      required: true,
    },

    mimeType: {
      type: String,
      required: true,
    },

    size: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ['pending', 'uploaded', 'processing', 'failed', 'deleted'],
      default: 'pending',
    },
  },
  { timestamps: true },
);

export default mongoose.model('Attachment', attachmentSchema);
