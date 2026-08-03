const Joi = require('joi');

const registerValidation = (data) => {
  const schema = Joi.object({
    username: Joi.string().min(6).max(50).required().messages({
      'string.base': '使用者名稱應該是字串',
      'string.empty': '使用者名稱不能為空',
      'string.min': '使用者名稱至少要有 {#limit} 個字',
      'string.max': '使用者名稱最多只能有 {#limit} 個字',
      'any.required': '使用者名稱是必填欄位',
    }),
    email: Joi.string().required().email().messages({
      'string.base': '信箱應該是字串',
      'string.empty': '信箱不能為空',
      'any.required': '信箱是必填欄位',
      'string.email': '信箱格式不正確',
    }),
    password: Joi.string()
      .min(6)
      .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*/])'))
      .required()
      .messages({
        'string.base': '密碼應該是字串',
        'string.empty': '密碼不能為空',
        'string.min': '密碼至少要有 {#limit} 個字',
        'string.pattern.base': '密碼必須包含至少一個大寫字母、一個小寫字母、一個數字、一個特殊符號',
        'any.required': '密碼是必填欄位',
      }),
    lastName: Joi.string().required().messages({
      'string.base': '姓氏應該是字串',
      'string.empty': '姓氏不能為空',
      'any.required': '姓氏是必填欄位',
    }),
    firstName: Joi.string().required().messages({
      'string.base': '名字應該是字串',
      'string.empty': '名字不能為空',
      'any.required': '名字是必填欄位',
    }),
    mobile: Joi.string().required().messages({
      'string.base': '手機號碼應該是字串',
      'string.empty': '手機號碼不能為空',
      'any.required': '手機號碼是必填欄位',
    }),
  });
  return schema.validate(data);
};

const loginValidation = (data) => {
  const schema = Joi.object({
    username: Joi.string().min(6).max(50).required().messages({
      'string.base': '使用者名稱應該是字串',
      'string.empty': '使用者名稱不能為空',
      'string.min': '使用者名稱至少要有 {#limit} 個字',
      'string.max': '使用者名稱最多只能有 {#limit} 個字',
      'any.required': '使用者名稱是必填欄位',
    }),
    password: Joi.string().min(6).required().messages({
      'string.base': '密碼應該是字串',
      'string.empty': '密碼不能為空',
      'string.min': '密碼至少要有 {#limit} 個字',
      'any.required': '密碼是必填欄位',
    }),
  });
  return schema.validate(data);
};

const contactValidation = (data) => {
  const schema = Joi.object({
    name: Joi.string().trim().min(2).max(80).required().messages({
      'string.base': '姓名應該是字串',
      'string.empty': '姓名不能為空',
    }),
    email: Joi.string().trim().max(254).required().email().messages({
      'string.base': '信箱應該是字串',
      'string.empty': '信箱不能為空',
      'string.email': '信箱格式不正確',
    }),
    category: Joi.string().trim().min(1).max(40).required().messages({
      'string.base': '類型應該是字串',
      'string.empty': '類型不能為空',
    }),
    subject: Joi.string().trim().min(4).max(100).required().messages({
      'string.base': '主旨應該是字串',
      'string.empty': '主旨不能為空',
    }),
    message: Joi.string().trim().min(5).max(3000).required().messages({
      'string.base': '訊息應該是字串',
      'string.empty': '訊息不能為空',
    }),
    replyPreference: Joi.string().valid('email', 'no-reply').default('email').messages({
      'string.base': '回覆偏好應該是字串',
    }),
    locale: Joi.string().valid('zh-TW', 'en').default('zh-TW').messages({
      'string.base': '語系應該是字串',
    }),
    website: Joi.string().trim().allow('').max(200).default('').messages({
      'string.base': '網站欄位應該是字串',
    }),
    acknowledged: Joi.boolean().valid(true).required().messages({
      'any.only': '必須同意聯絡聲明',
      'any.required': '必須同意聯絡聲明',
    }),
    status: Joi.string().required().messages({
      'string.base': '狀態應該是字串',
      'string.empty': '狀態不能為空',
    }),
    comment: Joi.string().allow('').messages({
      'string.base': '評論應該是字串',
    }),
  });
  return schema.validate(data);
};

module.exports = {
  registerValidation,
  loginValidation,
  contactValidation,
};
