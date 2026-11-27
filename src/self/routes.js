const router = require('express').Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const multer = require('multer');
const sharp = require('sharp');
const resizeImage = (bytes, size) =>
  sharp(bytes, { limitInputPixels: 60000000 })
    .rotate()
    .resize({
      width: size,
      height: size,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();
const { rateLimit } = require('express-rate-limit');
const { z } = require('zod');
const {
  SelfUser: User,
  SelfSession: Session,
  SelfEntry: Entry,
  SelfImage: Image,
  ensureIndexes,
} = require('./models');
const schema = require('./validation');
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const fail = (status, message) =>
  Object.assign(new Error(message), { status });
const hash = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');
const tokenOf = (req) =>
  (req.headers.cookie || '')
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('self_session='))
    ?.slice(13);
const cookies = (req) => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: req.secure,
  path: '/',
});
const serialize = (doc) => ({
  id: String(doc._id),
  kind: doc.kind,
  title: doc.title,
  occurredAt: doc.occurredAt,
  note: doc.note,
  images: doc.images,
  data: doc.data,
  version: doc.__v,
});
const dummy = bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 12);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    (req.get('X-Self-Request') !== '1' ||
      (!req.is('application/json') && !req.is('multipart/form-data')))
  )
    return next(fail(403, '請由本站提交操作'));
  next();
});
router.use(
  wrap(async (req, res, next) => {
    await ensureIndexes();
    next();
  }),
);
const publicUser = (u) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  role: u.role,
  status: u.status,
  version: u.__v,
});
router.post(
  '/auth/register',
  rateLimit({
    windowMs: 900000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: '申請次數過多，請稍後再試' },
  }),
  wrap(async (req, res) => {
    const { name, email, password } =
      require('../debt/validation').register.parse(req.body);
    await User.create({
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      status: 'pending',
      role: 'user',
    });
    res
      .status(201)
      .json({ message: '申請已送出，請等待管理員核准後再登入' });
  }),
);
router.post(
  '/auth/login',
  rateLimit({
    windowMs: 900000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: '登入嘗試過多，請稍後再試' },
  }),
  wrap(async (req, res) => {
    const input = z
      .object({
        email: z.email().trim().toLowerCase(),
        password: z.string().min(1).max(128),
      })
      .parse(req.body);
    const user = await User.findOne({ email: input.email }).select(
      '+passwordHash',
    );
    const valid = await bcrypt.compare(
      input.password,
      user?.passwordHash || dummy,
    );
    if (!user || !valid) throw fail(401, '電子郵件或密碼不正確');
    if (user.status !== 'approved')
      throw fail(
        403,
        {
          pending: '帳號正在等待管理員核准',
          rejected: '註冊申請未通過，請聯絡管理員',
          suspended: '帳號已停用，請聯絡管理員',
        }[user.status] || '帳號無法登入',
      );
    const old = tokenOf(req);
    if (old) await Session.deleteOne({ tokenHash: hash(old) });
    const token = crypto.randomBytes(32).toString('hex');
    const sessionAge = 7 * 86400000;
    await Session.create({
      user: user._id,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + sessionAge),
    });
    res.cookie('self_session', token, {
      ...cookies(req),
      maxAge: sessionAge,
    });
    res.json({ user: publicUser(user) });
  }),
);
router.post(
  '/auth/logout',
  wrap(async (req, res) => {
    const token = tokenOf(req);
    if (token) await Session.deleteOne({ tokenHash: hash(token) });
    res.clearCookie('self_session', cookies(req));
    res.json({ ok: true });
  }),
);
router.use(
  wrap(async (req, res, next) => {
    const token = tokenOf(req);
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      throw fail(401, '請先登入');
    const session = await Session.findOne({
      tokenHash: hash(token),
      expiresAt: { $gt: new Date() },
    });
    const user = session && (await User.findById(session.user));
    if (!user || user.status !== 'approved')
      throw fail(401, '登入已過期，請重新登入');
    req.selfUser = user;
    next();
  }),
);
router.get('/auth/me', (req, res) =>
  res.json({ user: publicUser(req.selfUser) }),
);
router.use('/admin', (req, res, next) =>
  req.selfUser.role === 'admin'
    ? next()
    : next(fail(403, '需要管理員權限')),
);
router.get(
  '/admin/users',
  wrap(async (req, res) =>
    res.json({
      users: (await User.find().sort({ createdAt: -1 })).map(publicUser),
    }),
  ),
);
router.patch(
  '/admin/users/:id',
  wrap(async (req, res) => {
    const id = schema.id.parse(req.params.id);
    const { status, version } =
      require('../debt/validation').accountStatus.parse(req.body);
    const target = await User.findById(id);
    if (!target) throw fail(404, '找不到帳號');
    if (target.role === 'admin')
      throw fail(403, '管理員帳號需透過伺服器管理');
    const allowed = {
      pending: ['approved', 'rejected'],
      approved: ['suspended'],
      rejected: ['approved'],
      suspended: ['approved'],
    };
    if (!allowed[target.status]?.includes(status))
      throw fail(422, '無效的帳號狀態變更');
    const user = await User.findOneAndUpdate(
      { _id: id, __v: version, status: target.status, role: 'user' },
      {
        $set: {
          status,
          reviewedBy: req.selfUser._id,
          reviewedAt: new Date(),
        },
        $inc: { __v: 1 },
      },
      { new: true },
    );
    if (!user) throw fail(409, '帳號已變更，請重新整理');
    if (status !== 'approved') await Session.deleteMany({ user: id });
    res.json({ user: publicUser(user) });
  }),
);
router.post(
  '/report-pdf',
  rateLimit({
    windowMs: 60000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: '匯出次數過多，請稍後再試' },
  }),
  wrap(async (req, res) => {
    const { renderReport } = require('./report-pdf');
    const pdf = await renderReport(req.body, (id) =>
      Image.findOne({ _id: id, owner: req.selfUser._id }).select('+data'),
    );
    res.type('application/pdf').send(pdf);
  }),
);
router.get(
  '/entries',
  wrap(async (req, res) => {
    res.json(await require('./list')(req, serialize));
  }),
);
async function validateEntry(req) {
  const input = schema.entry.parse(req.body, {
    error: z.locales.zhTW().localeError,
  });
  const ids = [...new Set(input.images)];
  if (
    (await Image.countDocuments({
      _id: { $in: ids },
      owner: req.selfUser._id,
    })) !== ids.length
  )
    throw fail(422, '圖片不存在或無法存取');
  return input;
}
router.post(
  '/entries',
  wrap(async (req, res) => {
    const input = await validateEntry(req);
    const doc = await Entry.create({ ...input, owner: req.selfUser._id });
    res.status(201).json({ entry: serialize(doc) });
  }),
);
router.put(
  '/entries/:id',
  wrap(async (req, res) => {
    const id = schema.id.parse(req.params.id);
    const input = await validateEntry(req);
    const version = z.number().int().min(0).parse(req.body.version);
    const doc = await Entry.findOneAndUpdate(
      { _id: id, owner: req.selfUser._id, __v: version },
      { $set: input, $inc: { __v: 1 } },
      { new: true },
    );
    if (!doc) throw fail(409, '紀錄已變更或不存在，請重新整理');
    res.json({ entry: serialize(doc) });
  }),
);
router.delete(
  '/entries/:id',
  wrap(async (req, res) => {
    const id = schema.id.parse(req.params.id);
    const version = z.number().int().min(0).parse(req.body.version);
    const result = await Entry.deleteOne({
      _id: id,
      owner: req.selfUser._id,
      __v: version,
    });
    if (!result.deletedCount)
      throw fail(409, '紀錄已變更或不存在，請重新整理');
    res.json({ ok: true });
  }),
);
router.get(
  '/mood-trend',
  wrap(async (req, res) => res.json(await require('./trend')(req))),
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
});
router.post(
  '/images',
  rateLimit({
    windowMs: 60000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  }),
  upload.single('file'),
  wrap(async (req, res) => {
    const file = req.file;
    if (!file) throw fail(422, '請選擇圖片');
    const bytes = file.buffer;
    let mime;
    if (
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      mime = 'image/png';
    else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
      mime = 'image/jpeg';
    else if (
      bytes.subarray(0, 4).toString() === 'RIFF' &&
      bytes.subarray(8, 12).toString() === 'WEBP'
    )
      mime = 'image/webp';
    if (!mime || mime !== file.mimetype)
      throw fail(422, '僅接受 JPEG、PNG、WebP 圖片');
    let thumbnail, preview;
    try {
      [thumbnail, preview] = await Promise.all([
        resizeImage(bytes, 480),
        resizeImage(bytes, 1600),
      ]);
    } catch {
      throw fail(422, '無法讀取圖片，請選擇有效的 JPEG、PNG 或 WebP');
    }
    const image = await Image.create({
      thumbnail,
      preview,
      owner: req.selfUser._id,
      data: bytes,
      mime,
      name: file.originalname.slice(0, 120),
    });
    res.status(201).json({ id: String(image._id) });
  }),
);
router.get(
  '/images/:id',
  wrap(async (req, res) => {
    const variant = z
      .enum(['thumbnail', 'preview', 'original'])
      .default('original')
      .parse(req.query.size);
    const filter = {
      _id: schema.id.parse(req.params.id),
      owner: req.selfUser._id,
    };
    const field = variant === 'original' ? 'data' : variant;
    const image = await Image.findOne(filter).select(`+${field}`);
    if (!image) throw fail(404, '圖片不存在');
    let bytes = image[field];
    if (!bytes && variant !== 'original') {
      const original = await Image.findOne(filter).select('+data');
      try {
        bytes = await resizeImage(
          original.data,
          variant === 'thumbnail' ? 480 : 1600,
        );
      } catch {
        throw fail(422, '無法讀取圖片');
      }
      await Image.updateOne(filter, { $set: { [field]: bytes } });
    }
    res
      .set('X-Content-Type-Options', 'nosniff')
      .type(variant === 'original' ? image.mime : 'image/webp')
      .send(bytes);
  }),
);
router.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.code === 11000)
    return res
      .status(409)
      .json({ message: '此電子郵件已申請或註冊，請登入或聯絡管理員' });
  if (error instanceof z.ZodError)
    return res
      .status(422)
      .json({ message: error.issues[0]?.message || '請檢查欄位內容' });
  if (error instanceof multer.MulterError)
    return res
      .status(422)
      .json({ message: '一次限一張圖片，每張上限 5 MB' });
  res.status(error.status || 500).json({
    message: error.status ? error.message : '服務暫時無法使用，請稍後重試',
  });
});
module.exports = router;
