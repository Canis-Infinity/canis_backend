const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');
const createApp = require('../src/app');
const { ThriftUser: User, ThriftSession: Session, ThriftStore: Store, ThriftImage: Image, ensureThriftIndexes } = require('../src/thrift/models');
const commerce = require('../src/thrift/services/commerce');
describe('thrift standalone MongoDB shop', () => {
  let mongo, app, admin, member, image;
  const contact = { platform: 'LINE', account: 'test-contact' };
  const customer = { name: '訪客', contact };
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6OHsAAAAASUVORK5CYII=', 'base64');
  async function account(role = 'user') {
    const user = await User.create({ name: '測試', email: `${crypto.randomUUID()}@example.test`, phone: '0912345678', contact, passwordHash: 'unused', role });
    const token = crypto.randomBytes(32).toString('hex');
    await Session.create({ user: user._id, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 60000) });
    return { user, cookie: `thrift_session=${token}` };
  }
  const call = (identity, method, path, body) => { const req = request(app)[method](`/api/thrift${path}`).set('X-Thrift-Request', '1'); if(identity) req.set('Cookie', identity.cookie); return body === undefined ? req : req.send(body); };
  const productInput = (extra = {}) => ({ name: '二手物品', price: 500, description: '**近全新**', tags: ['生活'], images: [image], quantity: 5, category: null, active: true, ...extra });
  const addProduct = async (extra = {}) => (await call(admin,'post','/admin/products',productInput(extra))).body.record;
  const checkout = (items, extra = {}) => ({ customer, items, note: '', key: crypto.randomUUID(), ...extra });
  beforeAll(async()=> { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri(), { dbName: 'thrift_test' }); await ensureThriftIndexes(); app = createApp(); },180000);
  beforeEach(async()=> { await Promise.all([User.deleteMany({}),Session.deleteMany({}),Store.deleteMany({}),Image.deleteMany({})]); admin=await account('admin');member=await account();image=String((await Image.create({ data:png,mime:'image/png',name:'test.png',owner:admin.user._id }))._id); });
  afterAll(async()=> { await mongoose.disconnect();await mongo?.stop(); });
  it('preserves order image snapshots and resolves legacy thumbnails by product ID after deletion', async () => {
    const secondImage = String((await Image.create({ data: png, mime: 'image/png', name: 'second.png', owner: admin.user._id }))._id);
    const first = await addProduct({ name: '同名商品' });
    const second = await addProduct({ name: '同名商品', images: [secondImage] });
    const response = await call(member, 'post', '/checkout', checkout([{ product: first.id, quantity: 1 }, { product: second.id, quantity: 1 }]));
    expect(response.status).toBe(201);
    const order = response.body.order;
    expect(order.items.map(i => i.image)).toEqual([image, secondImage]);
    // Change the first photo after purchase and soft-delete both products.
    await commerce.mutate(s => {
      s.products.find(p => p.id === first.id).images = [secondImage];
      s.products.forEach(p => { p.deleted = true; p.active = false; });
    });
    const snapshot = await call(null, 'get', `/order-link/${order.token}`);
    expect(snapshot.body.order.items.map(i => i.image)).toEqual([image, secondImage]);
    expect(snapshot.body.order.customer).toBeUndefined();
    expect(snapshot.body.order.owner).toBeUndefined();
    expect(snapshot.body.order.token).toBeUndefined();
    // Simulate an older order without an image snapshot.
    await commerce.mutate(s => { delete s.orders[0].items[1].image; });
    const legacy = await call(null, 'get', `/order-link/${order.token}`);
    expect(legacy.body.order.items.map(i => i.image)).toEqual([image, secondImage]);
    const own = await call(member, 'get', '/orders');
    expect(own.body.orders[0].items.map(i => i.image)).toEqual([image, secondImage]);
    const managed = await call(admin, 'get', '/admin/data?section=orders');
    expect(managed.body.orders[0].items.map(i => i.image)).toEqual([image, secondImage]);
    expect((await call(null, 'get', `/images/${image}`)).status).toBe(200);
    // Historical records without any remaining product data have a safe placeholder.
    await commerce.mutate(s => { s.products = s.products.filter(p => p.id !== second.id); });
    expect((await call(null, 'get', `/order-link/${order.token}`)).body.order.items[1].image).toBeNull();
  });
  it('keeps inactive cart product details available without listing or selling them',async()=>{
    const inactive=await addProduct({name:'收藏割愛',active:false,quantity:3});
    const other=await addProduct({name:'其他商品'});
    const catalog=await call(null,'get','/catalog');
    expect(catalog.body.products.map(p=>p.id)).toEqual([other.id]);
    const cart=await call(null,'get',`/cart-products?ids=${inactive.id}`);
    expect(cart.status).toBe(200);
    expect(cart.body.products).toEqual([{id:inactive.id,name:inactive.name,price:inactive.price,images:inactive.images,quantity:3,active:false,deleted:false}]);
    expect((await call(null,'get','/cart-products?ids=invalid')).status).toBe(422);
    expect((await call(null,'get','/cart-products')).body.products).toEqual([]);
    expect((await call(null,'post','/checkout',checkout([{product:inactive.id,quantity:1}]))).status).not.toBe(201);
    expect((await commerce.read()).orders).toHaveLength(0);
    await call(admin,'delete',`/admin/products/${inactive.id}`,{version:inactive.version});
    const removed=await call(null,'get',`/cart-products?ids=${inactive.id}`);
    expect(removed.body.products[0]).toMatchObject({name:inactive.name,images:inactive.images,price:inactive.price,active:false,deleted:true});
    expect((await call(null,'post','/checkout',checkout([{product:inactive.id,quantity:1}]))).status).not.toBe(201);
  });
  it('projects management reads without changing the full response or transaction state', async () => {
    const product = await addProduct();
    await call(null, 'post', '/checkout', checkout([{ product: product.id, quantity: 1 }]));
    const products = await call(admin, 'get', '/admin/data?section=products');
    expect(products.status).toBe(200);
    expect(products.body.products).toHaveLength(1);
    expect(products.body.orders).toEqual([]);
    expect(products.body.users).toEqual([]);
    const categories = await call(admin, 'get', '/admin/data?section=categories');
    expect(categories.body.products).toEqual([]);
    const users = await call(admin, 'get', '/admin/data?section=users');
    expect(users.body.products).toEqual([]);
    expect(users.body.users).toHaveLength(2);
    const orders = await call(admin, 'get', '/admin/data?section=orders');
    expect(orders.body.orders).toHaveLength(1);
    expect(orders.body.products).toHaveLength(1);
    const full = await call(admin, 'get', '/admin/data');
    expect(full.body.orders).toHaveLength(1);
    expect(full.body.users).toHaveLength(2);
    expect((await call(member, 'get', '/admin/data?section=products')).status).toBe(403);
    expect((await call(admin, 'get', '/admin/data?section=unknown')).status).toBe(422);
    const projected = await commerce.read('products categories');
    expect(projected.orders).toBeUndefined();
    expect(projected.receipts).toBeUndefined();
    expect((await commerce.read()).orders).toHaveLength(1);
  });
  it('registers active independent accounts and authenticates immediately',async()=>{
    const body={name:'新會員',email:'NEW@example.test',phone:'0912345678',contact,password:'test-password-2026'};
    expect((await call(null,'post','/auth/register',body)).status).toBe(201);
    const login=await call(null,'post','/auth/login',{email:body.email,password:body.password});
    expect(login.status).toBe(200);expect(login.body.user.status).toBe('active');expect(login.body.user.passwordHash).toBeUndefined();expect(login.headers['set-cookie'][0]).toContain('HttpOnly');
    expect((await call({cookie:'debt_session='+crypto.randomBytes(32).toString('hex')},'get','/auth/me')).status).toBe(401);
    expect((await call(member,'get','/admin/data')).status).toBe(403);
    expect((await call(null,'post','/auth/register',{...body,role:'admin'})).status).toBe(422);
  });
  it('accepts Threads for registration and guest orders and preserves the contact account', async () => {
    const threads = { platform: 'Threads', account: '@thrift-test' };
    const registration = await call(null, 'post', '/auth/register', { name: '新會員', email: 'threads@example.test', phone: '0912345678', contact: threads, password: 'test-password-2026' });
    expect(registration.status).toBe(201);
    const login = await call(null, 'post', '/auth/login', { email: 'threads@example.test', password: 'test-password-2026' });
    expect(login.status).toBe(200);
    expect(login.body.user.contact).toEqual(threads);
    const product = await addProduct();
    const response = await call(null, 'post', '/checkout', checkout([{ product: product.id, quantity: 1 }], { customer: { name: '訪客', contact: threads } }));
    expect(response.status).toBe(201);
    const managed = await call(admin, 'get', '/admin/data?section=orders');
    expect(managed.body.orders[0].customer.contact).toEqual(threads);
    const invalid = await call(null, 'post', '/checkout', checkout([{ product: product.id, quantity: 1 }], { customer: { name: '訪客', contact: { ...threads, platform: 'unknown' } } }));
    expect(invalid.status).toBe(422);
  });
  it('suspends and deletes accounts with session invalidation, protecting administrators',async()=>{
    expect((await call(admin,'patch',`/admin/users/${member.user.id}`,{status:'suspended',version:0})).status).toBe(200);
    expect((await call(member,'get','/auth/me')).status).toBe(401);
    expect((await call(admin,'delete',`/admin/users/${admin.user.id}`,{version:0})).status).toBe(409);
    expect((await call(admin,'delete',`/admin/users/${member.user.id}`,{version:1})).status).toBe(200);
  });
  it('requires photos, tags, integer prices and authentic image signatures',async()=>{
    for(const input of [{images:[]},{tags:[]},{price:1.5},{price:-1},{quantity:-1}])expect((await call(admin,'post','/admin/products',productInput(input))).status).toBe(422);
    const upload=await request(app).post('/api/thrift/admin/images').set('X-Thrift-Request','1').set('Cookie',admin.cookie).attach('file',png,'image.png');expect(upload.status).toBe(201);
    const invalid=await request(app).post('/api/thrift/admin/images').set('X-Thrift-Request','1').set('Cookie',admin.cookie).attach('file',Buffer.from('<svg><script/></svg>'),'fake.png');expect(invalid.status).toBe(422);
    expect((await call(null,'get',`/images/${upload.body.id}`)).headers['content-type']).toMatch(/image\/png/);
  });
  it('atomically prevents overselling and safely retries duplicate checkouts',async()=>{
    const p=await addProduct({quantity:1}); const body=checkout([{product:p.id,quantity:1}]);
    const results=await Promise.all([call(null,'post','/checkout',body),call(null,'post','/checkout',body),call(null,'post','/checkout',checkout(body.items))]);
    expect(results.filter(r=>r.status===201).length).toBeGreaterThanOrEqual(1);
    const state=await commerce.read();expect(state.products[0].quantity).toBe(0);expect(state.orders).toHaveLength(1);
    const winner=results.find(r=>r.status===201).body.order;
    const retryBody=winner.key===body.key?body:null;
    if(retryBody){const retry=await call(null,'post','/checkout',retryBody);expect(retry.body.order.number).toBe(winner.number);}
  });
  it('rolls back the whole basket when one item has insufficient stock',async()=>{
    const a=await addProduct({name:'A',quantity:3}),b=await addProduct({name:'B',quantity:0});
    expect((await call(null,'post','/checkout',checkout([{product:a.id,quantity:1},{product:b.id,quantity:1}]))).status).toBe(409);
    const state=await commerce.read();expect(state.products.find(p=>p.id===a.id).quantity).toBe(3);expect(state.orders).toHaveLength(0);
  });
  it('only edits status and notes while preserving order details and atomic stock transitions', async () => {
    const p = await addProduct({ quantity: 3 });
    const order = (await call(member, 'post', '/checkout', checkout([{ product: p.id, quantity: 1 }]))).body.order;
    const edit = { note: '備註', status: 'confirmed', version: 0 };
    for (const extra of [{ customer: { ...customer, name: '更名' } }, { items: [{ product: p.id, quantity: 2 }] }, { total: 0 }]) {
      expect((await call(admin, 'put', `/admin/orders/${order.id}`, { ...edit, ...extra })).status).toBe(422);
    }
    const updated = await call(admin, 'put', `/admin/orders/${order.id}`, edit);
    expect(updated.status).toBe(200);
    expect(updated.body.order).toMatchObject({ customer: order.customer, items: order.items, total: order.total });
    const cancel = { ...edit, status: 'cancelled', version: 1 };
    const results = await Promise.all([call(admin, 'put', `/admin/orders/${order.id}`, cancel), call(admin, 'put', `/admin/orders/${order.id}`, cancel)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect((await commerce.read()).products[0].quantity).toBe(3);
    await commerce.mutate(s => { s.products[0].quantity = 0; });
    expect((await call(admin, 'put', `/admin/orders/${order.id}`, { ...edit, version: 2 })).status).toBe(409);
    expect((await commerce.read()).orders[0].status).toBe('cancelled');
    await commerce.mutate(s => { s.products[0].quantity = 3; s.products[0].name = '新名稱'; });
    const restored = await call(admin, 'put', `/admin/orders/${order.id}`, { ...edit, version: 2 });
    expect(restored.status).toBe(200);
    expect(restored.body.order.items).toEqual(order.items);
    expect((await commerce.read()).products[0].quantity).toBe(2);
    await call(admin, 'put', `/admin/orders/${order.id}`, { ...cancel, version: 3 });
    expect((await call(admin, 'delete', `/admin/orders/${order.id}`, { version: 4 })).status).toBe(200);
  });
  it('restricts order visibility and derives authoritative prices',async()=>{
    const p=await addProduct();await call(member,'post','/checkout',checkout([{product:p.id,quantity:2}]));
    const other=await account();expect((await call(other,'get','/orders')).body.orders).toHaveLength(0);
    expect((await call(member,'get','/orders')).body.orders[0].total).toBe(1000);
    expect((await call(null,'get','/orders')).status).toBe(401);
    expect((await call(null,'post','/checkout',checkout([{product:p.id,quantity:1,price:1}]))).status).toBe(422);
  });
  it('enforces depth, cycles, stale edits and category deletion constraints',async()=>{
    const make=async(name,parent=null)=>(await call(admin,'post','/admin/categories',{name,parent})).body.record;
    const a=await make('A'),b=await make('B',a.id),c=await make('C',b.id);
    expect((await call(admin,'post','/admin/categories',{name:'D',parent:c.id})).status).toBe(422);
    expect((await call(admin,'put',`/admin/categories/${a.id}`,{name:'A',parent:c.id,version:0})).status).toBe(422);
    expect((await call(admin,'delete',`/admin/categories/${a.id}`,{version:0})).status).toBe(409);
    const p=await addProduct({category:c.id});expect((await call(admin,'delete',`/admin/categories/${c.id}`,{version:0})).status).toBe(409);
    await call(null,'post','/checkout',checkout([{product:p.id,quantity:1}]));expect((await call(admin,'put',`/admin/products/${p.id}`,{...productInput({category:c.id}),version:0})).status).toBe(409);
    expect((await request(app).post('/api/thrift/checkout').send({})).status).toBe(403);
  });
});
