import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      minLength: 1,
      maxLength: 100,
      required: true,
    },

    email: {
      type: String,
      unique: true,
      required: true,
      //! ADD MORE RULES
    },

    hash: {
      type: String,
      minLength: 1,
      maxLength: 256,
      required: true,
    },

    deletedAt: {
      type: Date,
    },

    deletedUser: {
      email: String,
    },

    //   "settings": {
    //   "defaultModel": "gpt-4o",
    //   "theme": "dark",
    //   "temperature": 0.7
    // },
  },
  { timestamps: true },
);

export const User = mongoose.model('User', userSchema);
