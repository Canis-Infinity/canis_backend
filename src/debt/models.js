const { maxAmount } = require('./config');
const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema({
  name: { type: String, required: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true, select: false },
  credentialVersion: { type: Number, default: 0 },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'suspended'], default: 'pending' },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'DebtUser' },
  reviewedAt: Date,
}, { timestamps: true, optimisticConcurrency: true, autoCreate: false, autoIndex: false });
const sessionSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  credentialVersion: { type: Number, default: 0 },
  user: { type: Schema.Types.ObjectId, ref: 'DebtUser', required: true, index: true },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true, autoCreate: false, autoIndex: false });
const paymentSchema = new Schema({
  method: { type: String, enum: ['bank', 'line_pay_money', 'ipass_money', 'cash', 'other'], required: true },
  bankCode: String,
  bankAccount: String,
  description: { type: String, trim: true, maxlength: 100, required: function () { return this.method === 'other'; } },
}, { _id: false });
const money = { type: Number, required: true, min: 1, max: maxAmount, validate: Number.isSafeInteger };
const repaymentSchema = new Schema({
  date: { type: String, required: true },
  amount: money,
  payment: { type: paymentSchema, required: true },
  note: { type: String, default: '', maxlength: 2000 },
}, { timestamps: true });
const borrowingSchema = new Schema({
  date: { type: String, required: true },
  amount: money,
  note: { type: String, default: '', maxlength: 2000 },
}, { timestamps: true });
const debtSchema = new Schema({
  owner: { type: Schema.Types.ObjectId, ref: 'DebtUser', required: true },
  date: { type: String, required: true },
  amount: money,
  lender: { type: String, required: true, maxlength: 100 },
  payment: { type: paymentSchema, required: true },
  note: { type: String, default: '', maxlength: 2000 },
  repayments: [repaymentSchema],
  borrowings: [borrowingSchema],
}, { timestamps: true, optimisticConcurrency: true, autoCreate: false, autoIndex: false });
debtSchema.index({ owner: 1, date: -1, _id: -1 });
// One debt and its repayments form one atomic document, including cascade deletion.
debtSchema.pre('validate', function () {
  const additional = this.borrowings.reduce((sum, item) => sum + BigInt(item.amount || 0), 0n);
  if (additional >= BigInt(this.amount || 0)) this.invalidate('amount', '首次借款金額必須大於 0');
  const paid = this.repayments.reduce((sum, item) => sum + BigInt(item.amount || 0), 0n);
  if (paid > BigInt(this.amount || 0)) this.invalidate('amount', '累計還款不可超過借款金額');
});

module.exports = {
  DebtUser: mongoose.model('DebtUser', userSchema, 'debt_users'),
  DebtSession: mongoose.model('DebtSession', sessionSchema, 'debt_sessions'),
  Debt: mongoose.model('Debt', debtSchema, 'debt_records'),
};

let indexesReady;
module.exports.ensureDebtIndexes = function ensureDebtIndexes() {
  // Existing backend disables command buffering: initialize only after Mongo is ready.
  if (!indexesReady) {
    indexesReady = Promise.all(['DebtUser', 'DebtSession', 'Debt'].map((name) => module.exports[name].createIndexes())).catch((error) => {
      indexesReady = undefined;
      throw error;
    });
  }
  return indexesReady;
};
