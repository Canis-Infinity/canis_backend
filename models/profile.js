const mongoose = require('mongoose');
const { Schema } = mongoose;

const localizedTextSchema = new Schema(
  {
    'zh-TW': { type: String, default: '' },
    en: { type: String, default: '' },
  },
  { _id: false }
);

const profileContentSchema = new Schema(
  {
    name: { type: String, default: '' },
    handle: { type: String, default: '' },
    title: { type: String, default: '' },
    badge: { type: String, default: '' },
    description: { type: String, default: '' },
    metadataTitle: { type: String, default: '' },
    metadataDescription: { type: String, default: '' },
  },
  { _id: false }
);

const profileLinkSchema = new Schema(
  {
    title: { type: localizedTextSchema, required: true },
    description: { type: localizedTextSchema, default: undefined },
    href: { type: String, required: true },
    icon: { type: String, required: true },
    domain: [{ type: String, required: true }],
    category: { type: String, default: 'links' },
    enabled: { type: Boolean, default: true },
    external: { type: Boolean, default: true },
    priority: { type: Number, default: 100 },
  },
  { _id: true }
);

const profileSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    avatar: { type: String, required: true },
    email: { type: String, required: true },
    siteUrl: { type: String, required: true },
    profile: {
      'zh-TW': { type: profileContentSchema, required: true },
      en: { type: profileContentSchema, required: true },
    },
    links: [profileLinkSchema],
  },
  { timestamps: true }
);

profileSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model('Profile', profileSchema);
