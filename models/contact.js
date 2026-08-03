const mongoose = require('mongoose');
const { Schema } = mongoose;

const contactSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  subject: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  replyPreference: {
    type: String,
    default: 'email',
  },
  locale: {
    type: String,
    default: 'zh-TW',
  },
  website: {
    type: String,
    default: '',
  },
  acknowledged: {
    type: Boolean,
    required: true,
  },
  status: {
    type: String,
    required: true,
  },
  comment: {
    type: String,
  },
  emailDelivery: {
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed', 'skipped'],
      default: 'pending',
    },
    messageId: { type: String, default: '' },
    error: { type: String, default: '' },
  },
}, { timestamps: true });

contactSchema.index({ status: 1, createdAt: -1 });
contactSchema.index({ createdAt: -1 });
contactSchema.index({ category: 1, createdAt: -1 });

module.exports = mongoose.model('Contact', contactSchema);
