const express = require('express');
const router = express.Router();
const registerValidation = require('../validation').registerValidation;
const loginValidation = require('../validation').loginValidation;
const { memoryUpload } = require('../src/middlewares/upload');
const { loginUser, registerUser } = require('../src/services/authService');
const { createEventLog } = require('../src/services/eventLogService');
const { authenticateNormal } = require('../src/middlewares/auth');
const env = require('../src/config/env');

async function recordAuthEvent(req, { action, status, user, message }) {
  try {
    await createEventLog({
      actor: {
        id: user?._id ? String(user._id) : '',
        username: user?.username || req.body?.username || '',
      },
      action,
      resource: 'auth',
      resourceId: user?._id ? String(user._id) : '',
      status,
      message,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
      requestId: req.id,
      metadata: { httpMethod: req.method, path: req.originalUrl },
    });
  } catch {
    // Authentication must still return its result if audit storage is unavailable.
  }
}

router.get('/', (req, res) => {
  res.send('Auth route');
});

// 註冊
router.post('/register', async (req, res) => {
  if (!env.allowRegistration) {
    return res.status(403).send('註冊功能未開放，請使用 scripts/create-admin.js 建立管理員');
  }

  let { error } = registerValidation(req.body);
  if (error) return res.status(400).send(error.details[0].message);

  let { username, email, password, lastName, firstName, mobile } = req.body;
  try {
    let savedUser = await registerUser({ username, email, password, lastName, firstName, mobile });
    return res.send({
      message: '成功註冊使用者',
      savedUser,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).send(error.statusCode ? error.message : `無法註冊使用者：${error}`);
  }
});

// 登入
router.post('/login', memoryUpload.any(), async (req, res) => {
  let { error } = loginValidation(req.body);
  if (error) {
    await recordAuthEvent(req, {
      action: 'login',
      status: 'failed',
      message: `登入失敗：${error.details[0].message}`,
    });
    return res.status(400).send(error.details[0].message);
  }

  try {
    const { token, user } = await loginUser(req.body);
    await recordAuthEvent(req, {
      action: 'login', status: 'success', user, message: '管理員登入成功',
    });
    return res.send({
      message: '成功登入',
      token,
      user,
    });
  } catch (error) {
    await recordAuthEvent(req, {
      action: 'login',
      status: 'failed',
      message: `登入失敗：${error.statusCode ? error.message : '系統錯誤'}`,
    });
    return res.status(error.statusCode || 500).send(error.statusCode ? error.message : error);
  }
});

router.post('/logout', (req, res, next) => {
  authenticateNormal(async (error, user) => {
    if (error || !user) {
      await recordAuthEvent(req, {
        action: 'logout', status: 'failed', message: '登出失敗：登入憑證無效或已過期',
      });
      return res.status(401).send('登入憑證無效或已過期');
    }

    await recordAuthEvent(req, {
      action: 'logout', status: 'success', user, message: '管理員登出成功',
    });
    return res.status(200).send({ message: '登出成功' });
  })(req, res, next);
});

module.exports = router;
