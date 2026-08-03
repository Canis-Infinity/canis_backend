const express = require('express');
const Profile = require('../models').profile;
const { requireNormalAuth } = require('../src/middlewares/auth');
const { uploadProfileImage } = require('../src/middlewares/upload');

const router = express.Router();

async function getProfileDocument() {
  return Profile.findOne({ key: 'default' }).lean();
}

router.get('/', async (req, res) => {
  try {
    const profile = await getProfileDocument();
    if (!profile) {
      return res.status(404).send({
        message: '尚未建立 Canis Den 個人資料，請先由後台完成設定',
      });
    }
    return res.status(200).send({
      message: '成功取得 Canis Den 個人資料',
      data: profile,
    });
  } catch (error) {
    return res.status(500).send(`無法取得 Canis Den 個人資料：${error}`);
  }
});

router.patch('/', requireNormalAuth, async (req, res) => {
  try {
    const payload = {
      avatar: req.body.avatar,
      email: req.body.email,
      siteUrl: req.body.siteUrl,
      profile: req.body.profile,
      links: req.body.links,
    };

    const updated = await Profile.findOneAndUpdate(
      { key: 'default' },
      { key: 'default', ...payload },
      { upsert: true, new: true, runValidators: true }
    ).lean();

    return res.status(200).send({
      message: '成功更新 Canis Den 個人資料',
      data: updated,
    });
  } catch (error) {
    return res.status(500).send(`無法更新 Canis Den 個人資料：${error}`);
  }
});

router.post('/avatar', requireNormalAuth, uploadProfileImage, (req, res) => {
  return res.status(201).send({
    message: '頭像上傳成功',
    data: { path: `/uploads/profile/${req.file.filename}` },
  });
});

router.post('/links', requireNormalAuth, async (req, res) => {
  try {
    const profile = await Profile.findOne({ key: 'default' });
    if (!profile) return res.status(404).send('找不到 Canis Den 個人資料');
    profile.links.push({ ...req.body, external: true });
    await profile.save();
    return res.status(201).send({ message: '連結新增成功', data: profile.links.at(-1) });
  } catch (error) {
    return res.status(400).send(`無法新增連結：${error.message}`);
  }
});

router.patch('/links/reorder', requireNormalAuth, async (req, res) => {
  try {
    const orderedIds = req.body?.orderedIds;
    if (!Array.isArray(orderedIds) || !orderedIds.length) {
      return res.status(400).send('請提供完整的連結排序');
    }

    const profile = await Profile.findOne({ key: 'default' });
    if (!profile) return res.status(404).send('找不到 Canis Den 個人資料');

    const currentIds = profile.links.map((link) => String(link._id));
    const uniqueIds = new Set(orderedIds.map(String));
    const isCompleteOrder = orderedIds.length === currentIds.length
      && uniqueIds.size === currentIds.length
      && currentIds.every((id) => uniqueIds.has(id));

    if (!isCompleteOrder) {
      return res.status(400).send('連結排序內容不完整或包含無效項目');
    }

    orderedIds.forEach((id, index) => {
      profile.links.id(id).priority = index + 1;
    });
    await profile.save();

    return res.status(200).send({
      message: '連結排序更新成功',
      data: profile.links,
    });
  } catch (error) {
    return res.status(400).send(`無法更新連結排序：${error.message}`);
  }
});

router.patch('/links/:linkId', requireNormalAuth, async (req, res) => {
  try {
    const profile = await Profile.findOne({ key: 'default' });
    const link = profile?.links.id(req.params.linkId);
    if (!link) return res.status(404).send('找不到指定連結');
    link.set({ ...req.body, external: true });
    await profile.save();
    return res.status(200).send({ message: '連結更新成功', data: link });
  } catch (error) {
    return res.status(400).send(`無法更新連結：${error.message}`);
  }
});

router.delete('/links/:linkId', requireNormalAuth, async (req, res) => {
  try {
    const profile = await Profile.findOne({ key: 'default' });
    const link = profile?.links.id(req.params.linkId);
    if (!link) return res.status(404).send('找不到指定連結');
    link.deleteOne();
    await profile.save();
    return res.status(200).send({ message: '連結刪除成功' });
  } catch (error) {
    return res.status(400).send(`無法刪除連結：${error.message}`);
  }
});

module.exports = router;
