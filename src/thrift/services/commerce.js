const crypto = require('crypto');
const mongoose = require('mongoose');
const { z } = require('zod');
const { ThriftStore: Store, ThriftImage: Image } = require('../models');
const schema = require('../validation');
const { fail } = require('../utils/http');
async function read() {
  const existing = await Store.findById('shop').lean();
  if (existing) return existing;
  try { await Store.updateOne({ _id: 'shop' }, { $setOnInsert: { products: [], categories: [], orders: [], receipts: [], __v: 0 } }, { upsert: true }); } catch (e) { if (e.code !== 11000) throw e; }
  return Store.findById('shop').lean();
}
// Compare-and-swap commits all inventory and order changes together, including on standalone MongoDB.
async function mutate(action) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const state = await read();
    const result = action(state);
    if (mongoose.mongo.BSON.calculateObjectSize(state) > 12 * 1024 * 1024) throw fail(409, '商店資料容量已達安全上限，請聯絡管理員封存舊資料');
    const saved = await Store.updateOne({ _id: 'shop', __v: state.__v }, { $set: { products: state.products, categories: state.categories, orders: state.orders, receipts: state.receipts }, $inc: { __v: 1 } });
    if (saved.modifiedCount) return result;
  }
  throw fail(409, '目前有其他訂單處理中，請稍後重試');
}
function find(list, id, version) {
  const record = list.find(r => r.id === id);
  if (!record) throw fail(404, '找不到紀錄');
  if (version !== undefined && record.version !== version) throw fail(409, '紀錄已變更，請重新載入');
  return record;
}
function touch(record) { record.version++; record.updatedAt = new Date().toISOString(); }
function create(input) { return { ...input, id: String(new mongoose.Types.ObjectId()), version: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; }
async function saveProduct(id, body) {
  const { version, ...fields } = body;
  const input = schema.product.parse(fields);
  if (id) z.number().int().min(0).parse(version);
  if ((await Image.countDocuments({ _id: { $in: input.images } })) !== new Set(input.images).size) throw fail(422, '商品圖片不存在');
  return mutate(state => {
    if (input.category) find(state.categories, input.category);
    if (!id) { const product = create({ ...input, deleted: false }); state.products.unshift(product); return product; }
    const product = find(state.products, id, version);
    if (product.deleted) throw fail(404, '商品已刪除');
    Object.assign(product, input); touch(product); return product;
  });
}
async function deleteProduct(id, version) {
  return mutate(state => { const product = find(state.products, id, version); product.deleted = true; product.active = false; touch(product); });
}
async function saveCategory(id, body) {
  const { version, ...fields } = body;
  const input = schema.category.parse(fields);
  if (id) z.number().int().min(0).parse(version);
  return mutate(state => {
    const current = id ? find(state.categories, id, version) : create(input);
    if (!id) state.categories.push(current); else { Object.assign(current, input); touch(current); }
    for (const node of state.categories) {
      let cursor = node, depth = 1;
      const seen = new Set([node.id]);
      while (cursor.parent) {
        const parent = find(state.categories, cursor.parent);
        if (seen.has(parent.id)) throw fail(422, '分類不可循環');
        seen.add(parent.id); cursor = parent; depth++;
        if (depth > 3) throw fail(422, '分類最多三層');
      }
    }
    return current;
  });
}
async function deleteCategory(id, version) {
  return mutate(state => {
    find(state.categories, id, version);
    if (state.categories.some(c => c.parent === id)) throw fail(409, '請先移動或刪除子分類');
    if (state.products.some(p => p.category === id && !p.deleted)) throw fail(409, '請先移動此分類的商品');
    state.categories = state.categories.filter(c => c.id !== id);
  });
}
async function checkout(body, user) {
  const input = schema.checkout.parse(body);
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ ...input, owner: user?.id || null })).digest('hex');
  return mutate(state => {
    const receipt = state.receipts.find(r => r.key === input.key);
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) throw fail(409, '此送單編號已使用，請重新結帳');
      return find(state.orders, receipt.order);
    }
    const items = reserve(state, input.items);
    const order = create({ ...input, token: crypto.randomBytes(32).toString('hex'), items, total: total(items), owner: user?.id || null, status: 'pending', number: `T${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(6).toString('hex').toUpperCase()}` });
    state.orders.unshift(order); state.receipts.push({ key: input.key, fingerprint, order: order.id }); return order;
  });
}
const total = items => items.reduce((sum, item) => sum + item.price * item.quantity, 0);
function reserve(state, items, previous = []) {
  return items.map(item => {
    const product = find(state.products, item.product);
    if (product.deleted || !product.active || product.quantity < item.quantity) throw fail(409, `${product.name} 已下架或庫存不足`);
    product.quantity -= item.quantity; touch(product);
    return { product: product.id, name: product.name, price: previous.find(p => p.product === item.product)?.price ?? product.price, quantity: item.quantity };
  });
}
function restore(state, items) { for (const item of items) { const p = find(state.products, item.product); p.quantity += item.quantity; touch(p); } }
async function editOrder(id, body) {
  const input = z.object({ customer: schema.customer, items: schema.items, note: z.string().trim().max(2000), status: z.enum(['pending', 'confirmed', 'completed', 'cancelled']), version: z.number().int().min(0) }).strict().parse(body);
  return mutate(state => {
    const order = find(state.orders, id, input.version);
    const itemsChanged = JSON.stringify(input.items) !== JSON.stringify(order.items.map(i => ({ product: i.product, quantity: i.quantity })));
    const wasCancelled = order.status === 'cancelled', isCancelled = input.status === 'cancelled';
    if (!wasCancelled && (itemsChanged || isCancelled)) restore(state, order.items);
    if (!isCancelled && (itemsChanged || wasCancelled)) order.items = reserve(state, input.items, order.items);
    if (isCancelled && itemsChanged) order.items = input.items.map(item => { const p = find(state.products, item.product); return { ...item, name: p.name, price: order.items.find(i => i.product === item.product)?.price ?? p.price }; });
    Object.assign(order, { customer: input.customer, note: input.note, status: input.status, total: total(order.items) }); touch(order); return order;
  });
}
async function deleteOrder(id, version) {
  return mutate(state => {
    const order = find(state.orders, id, version);
    if (order.status !== 'cancelled') throw fail(409, '請先取消訂單並補回庫存，再刪除');
    state.orders = state.orders.filter(o => o.id !== id);
    // Keep the key tombstone so retrying a deleted checkout cannot reserve stock again.
  });
}
module.exports = { read, mutate, saveProduct, deleteProduct, saveCategory, deleteCategory, checkout, editOrder, deleteOrder };
