const { z } = require('zod');
const name = z.string().trim().min(1, '此欄位為必填').max(80, '最多 80 字');
const password = z.string().min(12, '密碼至少 12 個字元').max(72, '密碼最多 72 個字元').refine(v => Buffer.byteLength(v) <= 72, '密碼最多 72 bytes');
const contact = z.object({ platform: z.enum(['IG', 'LINE', 'facebook', 'Discord', 'Threads']), account: z.string().trim().min(1, '請輸入聯繫帳號').max(200) }).strict();
const id = z.string().regex(/^[a-f0-9]{24}$/i, '無效的紀錄編號');
const customer = z.object({ name, contact }).strict();
const register = z.object({ name, email: z.email('請輸入有效信箱').trim().toLowerCase(), phone: z.string().trim().regex(/^\+?[0-9 ()-]{8,20}$/, '請輸入有效手機號碼'), contact, password }).strict();
const product = z.object({ name, price: z.number().int().min(0).max(999999999), description: z.string().trim().max(20000), tags: z.array(z.string().trim().min(1).max(30)).min(1, '至少一個標籤').max(20), images: z.array(id).min(1, '至少上傳一張商品照片').max(10), quantity: z.number().int().min(0).max(99999), category: id.nullable(), active: z.boolean() }).strict();
const category = z.object({ name, parent: id.nullable() }).strict();
const items = z.array(z.object({ product: id, quantity: z.number().int().min(1).max(99999) }).strict()).min(1).max(50).refine(v => new Set(v.map(i => i.product)).size === v.length, '商品不可重複');
const checkout = z.object({ customer, items, note: z.string().trim().max(2000), key: z.uuid() }).strict();
module.exports = { name, password, contact, customer, register, product, category, checkout, items, id,
  login: z.object({ email: z.email().trim().toLowerCase(), password: z.string().min(1).max(200) }).strict(),
  profile: z.object({ name }).strict(),
  changePassword: z.object({ currentPassword: z.string().min(1), newPassword: password, confirmPassword: z.string() }).strict().refine(v => v.newPassword === v.confirmPassword, { path: ['confirmPassword'], message: '兩次密碼不一致' }),
};
