const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const contactValidation = require('../validation').contactValidation;
const Contact = require('../models').contact;
const { requireNormalAuth } = require('../src/middlewares/auth');
const { sendContactNotification } = require('../src/services/contactEmailService');

router.use((req, res, next) => {
  next();
});

// 新增聯絡表單
router.post('/', async (req, res) => {
  if (req.body.website) {
    return res.send({
      message: '成功送出表單',
      savedContact: null,
    });
  }

  let data = {};
  let status = 'unread';
  let comment = '';
  data = {
    ...req.body,
    status,
    comment,
  }
  let { error } = contactValidation(data);
  if (error) return res.status(400).send(error.details[0].message);

  let newContact = new Contact(data);
  try {
    let savedContact = await newContact.save();

    try {
      savedContact.emailDelivery = await sendContactNotification(savedContact);
    } catch (emailError) {
      savedContact.emailDelivery = { status: 'failed', error: emailError.message };
    }
    await savedContact.save();

    return res.send({
      message: '成功送出表單',
      savedContact,
    });
  } catch (error) {
    return res.status(500).send(`無法送出表單：${error}`);
  }
});

// 更新聯絡表單
router.patch('/:_id', requireNormalAuth, async (req, res) => {
  let { error } = contactValidation(req.body);
  if (error) return res.status(400).send(error.details[0].message);

  let { _id } = req.params;
  try {
    let foundContact = await Contact.findOne({ _id: new mongoose.Types.ObjectId(_id) });
    if (!foundContact) {
      return res.status(400).send('無法取得聯絡表單');
    }
    let updatedContact = await Contact.findOneAndUpdate({ _id: new mongoose.Types.ObjectId(_id) }, req.body, {
      new: true,
      runValidators: true,
    });
    if (!updatedContact) {
      return res.status(400).send('無法更新聯絡表單');
    }
    return res.status(200).send({
      message: '成功更新聯絡表單',
      data: updatedContact,
    });
  } catch (error) {
    return res.status(500).send(`無法取得聯絡表單：${error}`);
  }
});

// 取得聯絡表單
router.get('/', requireNormalAuth, async (req, res) => {
  let { page, type, category } = req.query;
  page ? page = parseInt(page) : page = 1;

  let filter = {};

  if (type) {
    filter = { status: type };
  }
  if (category) {
    filter = { ...filter, category };
  }

  const perPage = 20;
  const skip = (page - 1) * perPage;

  const [amount, foundContacts] = await Promise.all([
    Contact.countDocuments(filter),
    Contact.find(filter).skip(skip).limit(perPage).sort({ createdAt: -1 }).lean(),
  ]);
  if (!amount && amount !== 0) {
    return res.status(500).send('無法取得聯絡表單數量');
  }
  const total = Math.ceil(amount / perPage);
  if (!foundContacts) {
    return res.status(400).send('無法取得聯絡表單');
  }
  return res.status(200).send({ page: page, total: total, data: foundContacts});
});

// 刪除聯絡表單
router.delete('/:_id', requireNormalAuth, async (req, res) => {
  let { _id } = req.params;
  try {
    let foundContacts = await Contact.findOne({ _id: new mongoose.Types.ObjectId(_id) });
    if (!foundContacts) {
      return res.status(400).send('無法取得聯絡表單');
    }
    let deletedContacts = await Contact.findOneAndDelete({ _id: new mongoose.Types.ObjectId(_id) });
    if (!deletedContacts) {
      return res.status(400).send('無法刪除聯絡表單');
    }
    return res.status(200).send({
      message: '成功刪除聯絡表單',
      data: deletedContacts,
    });
  } catch (error) {
    return res.status(500).send(`無法取得聯絡表單：${error}`);
  }
});

// 取得特定聯絡表單
router.get('/:_id', requireNormalAuth, async (req, res) => {
  let { _id } = req.params;
  try {
    let foundContact = await Contact.find({ _id: new mongoose.Types.ObjectId(_id) }).lean();
    if (!foundContact) {
      return res.status(400).send('無法取得聯絡表單');
    }
    return res.status(200).send(foundContact);
  } catch (error) {
    return res.status(500).send(`無法取得聯絡表單：${error}`);
  }
});

module.exports = router;
