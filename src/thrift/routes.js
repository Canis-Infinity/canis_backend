const router = require('express').Router();
const multer = require('multer');
const { rateLimit } = require('express-rate-limit');
const { z } = require('zod');
const { ThriftUser: User, ThriftSession: Session, ThriftImage: Image, ensureThriftIndexes } = require('./models');
const { asyncRoute, fail } = require('./utils/http');
const { publicUser, withOrderImages } = require('./utils/serializers');
const { getToken } = require('./utils/cookies');
const sessions = require('./services/sessions');
const commerce = require('./services/commerce');
const schema = require('./validation');
const { requestGuard, requireSession, requireAdmin, errorHandler } = require('./middleware');
router.use(requestGuard);
router.use(asyncRoute(async (req, res, next) => { await ensureThriftIndexes(); next(); }));
router.use('/auth', require('./routes/auth'));
router.get('/catalog', asyncRoute(async (req, res) => { const s = await commerce.read('products categories'); res.json({ products: s.products.filter(p => !p.deleted && p.active), categories: s.categories }); }));
router.get('/cart-products', asyncRoute(async (req, res) => {
  const query = z.object({ ids: z.string().max(1249).default('') }).parse(req.query);
  const ids = new Set(z.array(schema.id).max(50).parse(query.ids ? query.ids.split(',') : []));
  const s = await commerce.read('products');
  const products = s.products.filter(p => ids.has(p.id)).map(({ id, name, price, images, quantity, active, deleted }) => ({ id, name, price, images, quantity, active: active && !deleted, deleted: !!deleted }));
  res.json({ products });
}));
router.get('/images/:id', asyncRoute(async (req, res) => {
  const image = await Image.findById(schema.id.parse(req.params.id)).select('+data');
  if (!image) throw fail(404, '圖片不存在');
  res.set('X-Content-Type-Options', 'nosniff').type(image.mime).send(image.data);
}));
router.post('/checkout', rateLimit({ windowMs: 60000, limit: 15, message: { message: '送單過於頻繁，請稍後再試' } }), asyncRoute(async (req, res) => {
  const token = getToken(req);
  const user = token ? await sessions.authenticate(token) : null;
  res.status(201).json({ order: await commerce.checkout(req.body, user) });
}));
router.get('/orders', requireSession, asyncRoute(async (req, res) => { const s = await commerce.read('orders products'); const products = new Map(s.products.map(p => [p.id, p])); res.json({ orders: s.orders.filter(o => o.owner === req.thriftUser.id).map(o => withOrderImages(o, products)) }); }));
router.get('/order-link/:token', asyncRoute(async (req, res) => {
  if (!/^[a-f0-9]{64}$/.test(req.params.token)) throw fail(404, '訂單不存在');
  const s = await commerce.read('orders products');
  const order = s.orders.find(o => o.token === req.params.token);
  if (!order) throw fail(404, '訂單不存在或已刪除');
  const { number, items, total, status, createdAt } = withOrderImages(order, new Map(s.products.map(p => [p.id, p])));
  res.json({ order: { number, items, total, status, createdAt } });
}));
router.use('/admin', requireSession, requireAdmin);
router.get('/admin/data', asyncRoute(async (req, res) => {
  const { section } = z.object({ section: z.enum(['products', 'categories', 'orders', 'users']).optional() }).parse(req.query);
  // Older clients retain the full response; each management page requests only its dependencies.
  const projection = { products: 'products categories', categories: 'categories', orders: 'products categories orders' };
  const [s, users] = await Promise.all([
    section === 'users' ? Promise.resolve({}) : commerce.read(section ? projection[section] : 'products categories orders'),
    !section || section === 'users' ? User.find().sort({ createdAt: -1 }).then(rows => rows.map(publicUser)) : Promise.resolve([]),
  ]);
  res.json({ products: (s.products || []).filter(p => !p.deleted), categories: s.categories || [], orders: s.orders || [], users });
}));
for (const [plural, singular] of [['products', 'Product'], ['categories', 'Category']]) {
  router.post(`/admin/${plural}`, asyncRoute(async (req, res) => res.status(201).json({ record: await commerce[`save${singular}`](null, req.body) })));
  router.put(`/admin/${plural}/:id`, asyncRoute(async (req, res) => res.json({ record: await commerce[`save${singular}`](schema.id.parse(req.params.id), req.body) })));
  router.delete(`/admin/${plural}/:id`, asyncRoute(async (req, res) => { const { version } = z.object({ version: z.number().int().min(0) }).strict().parse(req.body); await commerce[`delete${singular}`](schema.id.parse(req.params.id), version); res.json({ message: '已刪除' }); }));
}
router.post('/admin/orders', asyncRoute(async (req, res) => res.status(201).json({ order: await commerce.checkout(req.body, null) })));
router.put('/admin/orders/:id', asyncRoute(async (req, res) => res.json({ order: await commerce.editOrder(req.params.id, req.body) })));
router.delete('/admin/orders/:id', asyncRoute(async (req, res) => { const { version } = z.object({ version: z.number().int().min(0) }).strict().parse(req.body); await commerce.deleteOrder(req.params.id, version); res.json({ message: '已刪除' }); }));
router.patch('/admin/users/:id', asyncRoute(async (req, res) => {
  const { status, version } = z.object({ status: z.enum(['active', 'suspended']), version: z.number().int().min(0) }).strict().parse(req.body);
  const user = await User.findOneAndUpdate({ _id: schema.id.parse(req.params.id), role: 'user', __v: version }, { $set: { status }, $inc: { __v: 1, credentialVersion: 1 } }, { new: true });
  if (!user) throw fail(409, '帳號已變更，或此帳號為管理員');
  await Session.deleteMany({ user: user._id }); res.json({ user: publicUser(user) });
}));
router.delete('/admin/users/:id', asyncRoute(async (req, res) => {
  const { version } = z.object({ version: z.number().int().min(0) }).strict().parse(req.body);
  const user = await User.findOneAndDelete({ _id: schema.id.parse(req.params.id), role: 'user', __v: version });
  if (!user) throw fail(409, '帳號已變更，或此帳號為管理員');
  await Session.deleteMany({ user: user._id }); res.json({ message: '帳號已刪除，既有訂單保留' });
}));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1, fields: 0 } });
router.post('/admin/images', upload.single('file'), asyncRoute(async (req, res) => {
  const file = req.file;
  if (!file) throw fail(422, '請選擇圖片');
  const b = file.buffer;
  const mime = b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : b[0] === 255 && b[1] === 216 && b[2] === 255 ? 'image/jpeg' : b.toString('ascii',0,4) === 'RIFF' && b.toString('ascii',8,12) === 'WEBP' ? 'image/webp' : null;
  if (!mime) throw fail(422, '只接受 JPEG、PNG、WebP 圖片');
  const image = await Image.create({ data: b, mime, name: file.originalname.slice(0,200), owner: req.thriftUser._id });
  res.status(201).json({ id: String(image._id) });
}));
router.use((error, req, res, next) => error instanceof multer.MulterError ? res.status(422).json({ message: '圖片上傳失敗：單張限 12MB，請逐張上傳' }) : next(error));
router.use(errorHandler);
module.exports = router;
