const mongoose = require("mongoose");
const { Schema } = mongoose;

const statusSchema = new Schema(
  {
    label: { type: String, default: "窩著" },
    mood: { type: String, default: "安靜但開心" },
    doing: { type: String, default: "整理日常基地" },
    location: { type: String, default: "九宵基地" },
    note: { type: String, default: "今天也慢慢生活。" },
    completeness: { type: Number, min: 0, max: 100, default: 100 },
  },
  { _id: false },
);

const profileSchema = new Schema(
  {
    displayName: { type: String, default: "Canis" },
    subtitle: { type: String, default: "人型犬的日常基地" },
    intro: {
      type: String,
      default: "這裡收著 Canis 的生活片段、出遊照片、碎念與一點犬化日常。",
    },
    traits: [{ type: String }],
  },
  { _id: false },
);

const footerSchema = new Schema(
  {
    owner: { type: String, default: "Canis" },
    ownerUrl: { type: String, default: "https://canis.world/" },
    rightsText: { type: String, default: "保留所有權利" },
  },
  { _id: false },
);

const contentSchema = new Schema(
  {
    headerLinkLabel: { type: String, default: "九宵基地" },
    headerLinkUrl: { type: String, default: "https://link.canis.world" },
    heroImage: { type: String, default: "" },
    heroEntryId: { type: String, default: "" },
    adultTitle: { type: String, default: "這裡是成年人的日常基地" },
    adultDescription: {
      type: String,
      default:
        "內容尺度會隨日記而變化；公開分享與轉載前，請先尊重 Canis 的界線。",
    },
    galleryBadge: { type: String, default: "照片牆" },
    galleryTitle: { type: String, default: "最近被帶回基地的畫面" },
    aboutBadge: { type: String, default: "關於這裡" },
    aboutTitle: { type: String, default: "Canis 的生活，不是另一份履歷" },
    aboutDescription: {
      type: String,
      default:
        "正式作品留在 iistw.com，這裡專心收下人型犬的日常、出遊、碎念與不定期出沒紀錄。",
    },
    faq1Question: {
      type: String,
      default: "Canis World 和 iistw.com 有什麼不同？",
    },
    faq1Answer: {
      type: String,
      default:
        "iistw.com 是正式作品與身份的入口；Canis World 則比較靠近生活本身，留下角色狀態、照片和當下的心情。",
    },
    faq2Question: { type: String, default: "這裡多久更新一次？" },
    faq2Answer: {
      type: String,
      default:
        "沒有固定班表。想記下來的時候就更新，讓頁面跟著 Canis 的生活節奏走。",
    },
    faq3Question: { type: String, default: "要去哪裡找到其他出沒地點？" },
    faq3Answer: {
      type: String,
      default: "社群與外部平台都整理在 link.canis.world。",
    },
    feature1Title: { type: String, default: "九宵基地" },
    feature1Description: {
      type: String,
      default: "日常、碎念、照片和角色狀態都收在這裡。",
    },
    feature2Title: { type: String, default: "出沒入口" },
    feature2Description: {
      type: String,
      default: "社群與外部平台放在 link.canis.world。",
    },
    feature3Title: { type: String, default: "慢慢更新" },
    feature3Description: {
      type: String,
      default: "這裡不趕進度，只留下真實生活的節奏。",
    },
  },
  { _id: false },
);

const entrySchema = new Schema(
  {
    title: { type: String, required: true },
    excerpt: { type: String, default: "" },
    content: { type: String, default: "" },
    category: { type: String, default: "daily" },
    mood: { type: String, default: "" },
    occurredAt: { type: Date, default: Date.now },
    tags: [{ type: String }],
    images: [{ type: String }],
    featured: { type: Boolean, default: false },
    published: { type: Boolean, default: true },
    priority: { type: Number, default: 100 },
  },
  { timestamps: true },
);

const faqSchema = new Schema(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
    priority: { type: Number, default: 100 },
    published: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const featureCardSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    icon: {
      type: String,
      enum: ["home", "map-pin", "calendar", "paw-print", "heart", "camera"],
      default: "home",
    },
    priority: { type: Number, default: 100 },
    published: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const canisWorldSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    schemaVersion: { type: Number, default: 0 },
    status: { type: statusSchema, default: () => ({}) },
    profile: { type: profileSchema, default: () => ({}) },
    content: { type: contentSchema, default: () => ({}) },
    footer: { type: footerSchema, default: () => ({}) },
    faqs: [faqSchema],
    featureCards: [featureCardSchema],
    entries: [entrySchema],
  },
  { timestamps: true },
);

canisWorldSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model("CanisWorld", canisWorldSchema);
