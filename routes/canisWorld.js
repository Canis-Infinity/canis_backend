const express = require("express");
const CanisWorld = require("../models").canisWorld;
const { requireNormalAuth } = require("../src/middlewares/auth");
const { uploadCanisWorldMedia } = require("../src/middlewares/upload");

const router = express.Router();

const INITIAL_DATA = {
  status: {
    label: "剛散步回來",
    mood: "有點累但尾巴還在晃",
    doing: "整理出遊照片",
    location: "九宵基地",
    note: "今天的 Canis 正在把日常放回自己的窩裡。",
    completeness: 100,
  },
  profile: {
    displayName: "Canis",
    subtitle: "人型犬的日常基地",
    intro:
      "這裡是 Canis 的日常棲地。不是正式作品集，也不是商業名片，只是一些生活片段、出遊照片、犬化狀態和慢慢被整理好的自己。",
    traits: ["人型犬", "日常紀錄", "出遊照片", "基地生活"],
  },
  footer: {
    owner: "Canis",
    ownerUrl: "https://canis.world/",
    rightsText: "保留所有權利",
  },
  content: {
    headerLinkLabel: "九宵基地",
    headerLinkUrl: "https://link.canis.world",
    adultTitle: "這裡是成年人的日常基地",
    adultDescription:
      "內容尺度會隨日記而變化；公開分享與轉載前，請先尊重 Canis 的界線。",
    galleryBadge: "照片牆",
    galleryTitle: "最近被帶回基地的畫面",
    aboutBadge: "關於這裡",
    aboutTitle: "Canis 的生活，不是另一份履歷",
    aboutDescription:
      "正式作品留在 iistw.com，這裡專心收下人型犬的日常、出遊、碎念與不定期出沒紀錄。",
    faq1Question: "Canis World 和 iistw.com 有什麼不同？",
    faq1Answer:
      "iistw.com 是正式作品與身份的入口；Canis World 則比較靠近生活本身，留下角色狀態、照片和當下的心情。",
    faq2Question: "這裡多久更新一次？",
    faq2Answer:
      "沒有固定班表。想記下來的時候就更新，讓頁面跟著 Canis 的生活節奏走。",
    faq3Question: "要去哪裡找到其他出沒地點？",
    faq3Answer: "社群與外部平台都整理在 link.canis.world。",
    feature1Title: "九宵基地",
    feature1Description: "日常、碎念、照片和角色狀態都收在這裡。",
    feature2Title: "出沒入口",
    feature2Description: "社群與外部平台放在 link.canis.world。",
    feature3Title: "慢慢更新",
    feature3Description: "這裡不趕進度，只留下真實生活的節奏。",
  },
  faqs: [
    {
      question: "Canis World 和 iistw.com 有什麼不同？",
      answer:
        "iistw.com 是正式作品與身份的入口；Canis World 則比較靠近生活本身，留下角色狀態、照片和當下的心情。",
      priority: 1,
      published: true,
    },
    {
      question: "這裡多久更新一次？",
      answer:
        "沒有固定班表。想記下來的時候就更新，讓頁面跟著 Canis 的生活節奏走。",
      priority: 2,
      published: true,
    },
    {
      question: "要去哪裡找到其他出沒地點？",
      answer: "社群與外部平台都整理在 link.canis.world。",
      priority: 3,
      published: true,
    },
  ],
  featureCards: [
    {
      title: "九宵基地",
      description: "日常、碎念、照片和角色狀態都收在這裡。",
      icon: "home",
      priority: 1,
      published: true,
    },
    {
      title: "出沒入口",
      description: "社群與外部平台放在 link.canis.world。",
      icon: "map-pin",
      priority: 2,
      published: true,
    },
    {
      title: "慢慢更新",
      description: "這裡不趕進度，只留下真實生活的節奏。",
      icon: "calendar",
      priority: 3,
      published: true,
    },
  ],
  entries: [
    {
      title: "七月的外出日",
      excerpt: "帶著一點熱氣、一點興奮，還有很多想留下來的畫面。",
      content:
        "日常不是每次都要很盛大，有時只是走出去、吃點東西、拍幾張照片，再把那天的氣味帶回基地。",
      category: "出遊",
      mood: "開心",
      occurredAt: "2026-07-26",
      tags: ["散步", "照片", "夏天"],
      images: [
        "/daily/2026-07-26/LINE_ALBUM_20260726_260727_1.jpg",
        "/daily/2026-07-26/LINE_ALBUM_20260726_260727_12.jpg",
        "/daily/2026-07-26/LINE_ALBUM_20260726_260727_14.jpg",
      ],
      featured: true,
      published: true,
      priority: 1,
    },
    {
      title: "補給與窩邊小事",
      excerpt: "普通的一天也可以很像 Canis。",
      content:
        "把出門的照片收起來，給自己一點安靜時間。這種小小的紀錄，可能才是基地最穩定的形狀。",
      category: "日常",
      mood: "安靜",
      occurredAt: "2026-07-25",
      tags: ["補給", "基地", "生活"],
      images: [
        "/daily/2026-07-25/3CD93EE3-D4D9-4524-BED0-31A335A2D191.jpg",
        "/daily/2026-07-25/LINE_ALBUM_20260725_260727_4.jpg",
      ],
      featured: false,
      published: true,
      priority: 2,
    },
  ],
};

async function getDocument() {
  const document = await CanisWorld.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default" } },
    { upsert: true, new: true, runValidators: true },
  );

  if ((Number(document.schemaVersion) || 0) < 2) {
    if ((Number(document.schemaVersion) || 0) < 1) {
      document.set(INITIAL_DATA);
    } else {
      document.content = INITIAL_DATA.content;
    }
    document.schemaVersion = 2;
    await document.save();
  }

  if ((Number(document.schemaVersion) || 0) < 3) {
    if (!document.faqs.length) {
      document.faqs = INITIAL_DATA.faqs;
    }
    if (!document.featureCards.length) {
      document.featureCards = INITIAL_DATA.featureCards;
    }
    if (!Number.isFinite(document.status.completeness)) {
      document.status.completeness = 100;
    }
    document.schemaVersion = 3;
    await document.save();
  }

  return document;
}

function publicData(document) {
  const source = document.toObject ? document.toObject() : document;
  return {
    status: source.status,
    profile: source.profile,
    content: source.content,
    footer: source.footer,
    faqs: [...(source.faqs || [])]
      .filter((item) => item.published)
      .sort((a, b) => (Number(a.priority) || 0) - (Number(b.priority) || 0)),
    featureCards: [...(source.featureCards || [])]
      .filter((item) => item.published)
      .sort((a, b) => (Number(a.priority) || 0) - (Number(b.priority) || 0)),
    entries: [...(source.entries || [])]
      .filter((entry) => entry.published)
      .sort((a, b) => {
        const priorityDelta =
          (Number(a.priority) || 0) - (Number(b.priority) || 0);
        if (priorityDelta) return priorityDelta;
        return (
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
        );
      }),
  };
}

router.get("/", async (req, res) => {
  try {
    const document = await getDocument();
    return res.status(200).send({
      message: "成功取得 Canis World 日常資料",
      data: publicData(document),
    });
  } catch (error) {
    return res.status(500).send(`無法取得 Canis World 日常資料：${error}`);
  }
});

router.get("/admin", requireNormalAuth, async (req, res) => {
  try {
    const document = await getDocument();
    return res.status(200).send({
      message: "成功取得 Canis World 管理資料",
      data: document,
    });
  } catch (error) {
    return res.status(500).send(`無法取得 Canis World 管理資料：${error}`);
  }
});

router.patch("/settings", requireNormalAuth, async (req, res) => {
  try {
    const document = await getDocument();
    if (req.body.status) document.status = req.body.status;
    if (req.body.profile) document.profile = req.body.profile;
    if (req.body.content) document.content = req.body.content;
    if (req.body.footer) document.footer = req.body.footer;
    await document.save();
    return res.status(200).send({
      message: "Canis World 設定已更新",
      data: document,
    });
  } catch (error) {
    return res.status(400).send(`無法更新 Canis World 設定：${error.message}`);
  }
});

router.post("/entries", requireNormalAuth, async (req, res) => {
  try {
    const document = await getDocument();
    document.entries.push(req.body);
    await document.save();
    return res.status(201).send({
      message: "日常紀錄新增成功",
      data: document.entries.at(-1),
    });
  } catch (error) {
    return res.status(400).send(`無法新增日常紀錄：${error.message}`);
  }
});

router.patch("/entries/:entryId", requireNormalAuth, async (req, res) => {
  try {
    const document = await getDocument();
    const entry = document.entries.id(req.params.entryId);
    if (!entry) return res.status(404).send("找不到指定日常紀錄");
    entry.set(req.body);
    await document.save();
    return res.status(200).send({
      message: "日常紀錄更新成功",
      data: entry,
    });
  } catch (error) {
    return res.status(400).send(`無法更新日常紀錄：${error.message}`);
  }
});

router.delete("/entries/:entryId", requireNormalAuth, async (req, res) => {
  try {
    const document = await getDocument();
    const entry = document.entries.id(req.params.entryId);
    if (!entry) return res.status(404).send("找不到指定日常紀錄");
    entry.deleteOne();
    await document.save();
    return res.status(200).send({ message: "日常紀錄刪除成功" });
  } catch (error) {
    return res.status(400).send(`無法刪除日常紀錄：${error.message}`);
  }
});

function registerCollectionRoutes(path, collection, labels) {
  router.post(`/${path}`, requireNormalAuth, async (req, res) => {
    try {
      const document = await getDocument();
      document[collection].push(req.body);
      await document.save();
      return res.status(201).send({
        message: `${labels.single}新增成功`,
        data: document[collection].at(-1),
      });
    } catch (error) {
      return res.status(400).send(`無法新增${labels.single}：${error.message}`);
    }
  });

  router.patch(`/${path}/:itemId`, requireNormalAuth, async (req, res) => {
    try {
      const document = await getDocument();
      const item = document[collection].id(req.params.itemId);
      if (!item) return res.status(404).send(`找不到指定${labels.single}`);
      item.set(req.body);
      await document.save();
      return res
        .status(200)
        .send({ message: `${labels.single}更新成功`, data: item });
    } catch (error) {
      return res.status(400).send(`無法更新${labels.single}：${error.message}`);
    }
  });

  router.delete(`/${path}/:itemId`, requireNormalAuth, async (req, res) => {
    try {
      const document = await getDocument();
      const item = document[collection].id(req.params.itemId);
      if (!item) return res.status(404).send(`找不到指定${labels.single}`);
      item.deleteOne();
      await document.save();
      return res.status(200).send({ message: `${labels.single}刪除成功` });
    } catch (error) {
      return res.status(400).send(`無法刪除${labels.single}：${error.message}`);
    }
  });
}

registerCollectionRoutes("faqs", "faqs", { single: "常見問題" });
registerCollectionRoutes("feature-cards", "featureCards", {
  single: "資訊卡片",
});

router.post("/media", requireNormalAuth, uploadCanisWorldMedia, (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];
  return res.status(201).send({
    message: "日常圖片上傳成功",
    data: files.map((file) => ({
      path: `/uploads/canis-world/${file.filename}`,
    })),
  });
});

module.exports = router;
