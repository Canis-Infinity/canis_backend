const mongoose = require('mongoose');
const { Schema } = mongoose;

const visitHistorySchema = new Schema(
  {
    ipAddress: {
      type: String,
      default: '',
      index: true,
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

module.exports = mongoose.model('VisitHistory', visitHistorySchema);
