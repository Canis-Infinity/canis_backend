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
  it('registers active independent accounts and authenticates immediately',async()=>{
    const body={name:'新會員',email:'NEW@example.test',phone:'0912345678',contact,password:'test-password-2026'};
    expect((await call(null,'post','/auth/register',body)).status).toBe(201);
    const login=await call(null,'post','/auth/login',{email:body.email,password:body.password});
    expect(login.status).toBe(200);expect(login.body.user.status).toBe('active');expect(login.body.user.passwordHash).toBeUndefined();expect(login.headers['set-cookie'][0]).toContain('HttpOnly');
    expect((await call({cookie:'debt_session='+crypto.randomBytes(32).toString('hex')},'get','/auth/me')).status).toBe(401);
    expect((await call(member,'get','/admin/data')).status).toBe(403);
    expect((await call(null,'post','/auth/register',{...body,role:'admin'})).status).toBe(422);
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
  it('changes items, cancels exactly once, restores and deletes with private lookup',async()=>{
    const a=await addProduct({name:'A',quantity:3}),b=await addProduct({name:'B',quantity:2});
    const order=(await call(member,'post','/checkout',checkout([{product:a.id,quantity:1}]))).body.order;
    expect(order.number).toMatch(/^T\d{8}-[A-F0-9]+$/);
    const edit={customer,items:[{product:b.id,quantity:2}],note:'改單',status:'confirmed',version:0};
    expect((await call(admin,'put',`/admin/orders/${order.id}`,edit)).status).toBe(200);
    let state=await commerce.read();expect(state.products.find(p=>p.id===a.id).quantity).toBe(3);expect(state.products.find(p=>p.id===b.id).quantity).toBe(0);
    expect((await call(admin,'put',`/admin/orders/${order.id}`,{...edit,items:[{product:a.id,quantity:99}],version:1})).status).toBe(409);
    const cancel={...edit,status:'cancelled',version:1};const results=await Promise.all([call(admin,'put',`/admin/orders/${order.id}`,cancel),call(admin,'put',`/admin/orders/${order.id}`,cancel)]);expect(results.map(r=>r.status).sort()).toEqual([200,409]);
    state=await commerce.read();expect(state.products.find(p=>p.id===b.id).quantity).toBe(2);
    const lookup=await call(null,'get',`/order-link/${order.token}`);expect(lookup.status).toBe(200);expect(lookup.body.order.customer).toBeUndefined();expect(lookup.body.order.status).toBe('cancelled');
    expect((await call(admin,'delete',`/admin/orders/${order.id}`,{version:2})).status).toBe(200);expect((await call(null,'get',`/order-link/${order.token}`)).status).toBe(404);
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
