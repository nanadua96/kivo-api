import mongoose, { Schema } from 'mongoose';

const assetSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },

    key: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },

    bucket: {
      type: String,
      required: true,
    },

    originalName: {
      type: String,
      trim: true,
    },

    mimeType: {
      type: String,
      required: true,
    },

    size: {
      type: Number,
      default: 0,
    },

    purpose: {
      type: String,
      enum: ['user_avatar', 'chat_attachment'],
    },

    status: {
      type: String,
      enum: ['pending', 'active', 'archived'],
      default: 'pending',
    },

    attachedTo: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'docModel',
    },

    docModel: {
      type: String,
      enum: ['User', 'Message'],
    },

    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  },
);

assetSchema.index({ key: 1 }, { unique: true });

export const Asset = mongoose.model('Asset', assetSchema);
