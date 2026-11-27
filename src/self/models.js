const mongoose = require('mongoose');
const { Schema } = mongoose;
const options = { timestamps: true, autoCreate: false, autoIndex: false };
const definitions = {
  SelfUser: [
    'users',
    new Schema(
      {
        name: String,
        status: {
          type: String,
          enum: ['pending', 'approved', 'rejected', 'suspended'],
          default: 'approved',
        },
        role: { type: String, enum: ['user', 'admin'], default: 'user' },
        reviewedBy: Schema.Types.ObjectId,
        reviewedAt: Date,
        email: { type: String, unique: true },
        passwordHash: { type: String, select: false },
      },
      options,
    ),
  ],
  SelfSession: [
    'sessions',
    new Schema(
      {
        user: Schema.Types.ObjectId,
        tokenHash: { type: String, unique: true },
        expiresAt: { type: Date, expires: 0 },
      },
      options,
    ),
  ],
  SelfEntry: [
    'entries',
    new Schema(
      {
        owner: { type: Schema.Types.ObjectId, required: true },
        kind: String,
        title: String,
        occurredAt: Date,
        note: String,
        images: [String],
        data: Schema.Types.Mixed,
      },
      options,
    ),
  ],
  SelfImage: [
    'images',
    new Schema(
      {
        owner: Schema.Types.ObjectId,
        data: { type: Buffer, select: false },
        thumbnail: { type: Buffer, select: false },
        preview: { type: Buffer, select: false },
        mime: String,
        name: String,
      },
      options,
    ),
  ],
};
definitions.SelfEntry[1].index({ owner: 1, occurredAt: -1, _id: -1 });
for (const [name, [collection, schema]] of Object.entries(definitions))
  module.exports[name] = mongoose.connection.model(
    name,
    schema,
    `self_${collection}`,
  );
let ready;
module.exports.ensureIndexes = () =>
  (ready ||= Promise.all(
    Object.keys(definitions).map((name) =>
      module.exports[name].createIndexes(),
    ),
  ).catch((error) => {
    ready = undefined;
    throw error;
  }));
