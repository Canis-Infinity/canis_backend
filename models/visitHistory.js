const mongoose = require('mongoose');
const { Schema } = mongoose;

const visitHistorySchema = new Schema(
  {
    ipAddress: {
      type: String,
      default: '',
      index: true,
    },
    site: {
      type: String,
      enum: ['canis-den', 'frontend'],
      default: 'canis-den',
      index: true,
    },
    path: {
      type: String,
      default: '',
    },
    time: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

visitHistorySchema.index({ time: -1 });
visitHistorySchema.index({ site: 1, time: -1 });

module.exports = mongoose.model('VisitHistory', visitHistorySchema);
