const { z } = require('zod');

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '請選擇日期').refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value >= '1900-01-01';
}, '日期無效');
const amount = z.number().int('金額必須是新臺幣整數').min(1, '金額必須大於 0').max(999999999999, '金額超出可記錄範圍');
const payment = z.discriminatedUnion('method', [
  z.object({ method: z.literal('bank'), bankCode: z.string().regex(/^\d{3}$/, '銀行代碼需為 3 位數字'), bankAccount: z.string().regex(/^\d{5,20}$/, '銀行帳號需為 5–20 位數字') }).strict(),
  ...['line_pay_money', 'ipass_money', 'cash'].map((method) => z.object({ method: z.literal(method) }).strict()),
]);
const email = z.string().trim().toLowerCase().email('請輸入有效的電子郵件').max(254);
const password = z.string().min(12, '密碼至少需要 12 個字元').refine((value) => Buffer.byteLength(value, 'utf8') <= 72, '密碼不可超過 72 bytes');
const register = z.object({ name: z.string().trim().min(1, '請輸入名稱').max(80), email, password }).strict();
const login = z.object({ email, password: z.string().min(1, '請輸入密碼').max(200) }).strict();
const debt = z.object({ date, amount, lender: z.string().trim().min(1, '請填寫跟誰借').max(100), payment, note: z.string().trim().max(2000).default('') }).strict();
const repayment = z.object({ date, amount, payment, note: z.string().trim().max(2000).default('') }).strict();
const version = z.object({ version: z.number().int().nonnegative() }).strict();
const accountStatus = z.object({ status: z.enum(['approved', 'rejected', 'suspended']), version: z.number().int().nonnegative() }).strict();
const borrowing = debt.pick({ date: true, amount: true, note: true });
const changePassword = z.object({ currentPassword: login.shape.password, newPassword: password, confirmPassword: z.string() }).strict().refine((v) => v.newPassword === v.confirmPassword, { path: ['confirmPassword'], message: '兩次密碼不一致' }).refine((v) => v.currentPassword !== v.newPassword, { path: ['newPassword'], message: '新密碼不可與目前密碼相同' });
const profile = z.object({ name: register.shape.name }).strict();
module.exports = { profile, changePassword, register, login, debt, repayment, borrowing, version, accountStatus };
