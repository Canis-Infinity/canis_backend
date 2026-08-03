const mongoose = require('mongoose');
const { Schema } = mongoose;

const eventLogSchema = new Schema(
  {
    actor: {
      id: { type: String, default: '' },
      username: { type: String, default: '' },
    },
    action: { type: String, required: true, index: true },
    resource: { type: String, required: true, index: true },
    resourceId: { type: String, default: '', index: true },
    status: {
      type: String,
      enum: ['success', 'failed'],
      default: 'success',
      index: true,
    },
    message: { type: String, default: '' },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    requestId: { type: String, default: '', index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

eventLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('EventLog', eventLogSchema);
