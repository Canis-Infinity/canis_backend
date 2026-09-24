const { Debt } = require('../models');
const schema = require('../validation');
const { fail, checkVersion } = require('../utils/http');
const { serializeDebt } = require('../utils/serializers');
const { maxAmount, maxRecords } = require('../config');
const checkBalance = (debt) => {
  if (!Number.isSafeInteger(debt.amount) || debt.amount > maxAmount)
    throw fail(422, '累計借款超出可記錄範圍', {
      amount: ['累計借款最多 999,999,999,999 元']
    });
  const paid = debt.repayments.reduce(
    (sum, item) => sum + BigInt(item.amount),
    0n
  );
  if (paid > BigInt(debt.amount))
    throw fail(422, '累計還款不可超過借款金額', {
      amount: ['累計還款不可超過借款金額']
    });
};
async function findOwned(ownerId, debtId) {
  if (!/^[a-f0-9]{24}$/i.test(debtId)) throw fail(404, '找不到債務');
  const debt = await Debt.findOne({ _id: debtId, owner: ownerId });
  if (!debt) throw fail(404, '找不到債務');
  return debt;
}

async function list(ownerId) {
  const debts = await Debt.find({ owner: ownerId }).sort({ date: -1, _id: -1 });
  return debts.map(serializeDebt);
}

async function create(ownerId, body) {
  const input = schema.debt.parse(body);
  const debt = await Debt.create({ ...input, owner: ownerId });
  return serializeDebt(debt);
}

async function update(debt, body) {
  const { version, ...input } = schema.debt
    .extend(schema.version.shape)
    .parse(body);
  checkVersion(debt, version);
  Object.assign(debt, input);
  checkBalance(debt);
  await debt.save();
  return serializeDebt(debt);
}

async function remove(debt, ownerId, body) {
  const { version } = schema.version.parse(body);
  const result = await Debt.deleteOne({
    _id: debt._id,
    owner: ownerId,
    __v: version
  });
  if (!result.deletedCount) throw fail(409, '紀錄已變更，請重新整理後再試');
  return { message: '債務及全部還款紀錄已刪除' };
}

async function addRepayments(debt, body) {
  const { version, ...input } = schema.repayment
    .extend(schema.version.shape)
    .parse(body);
  checkVersion(debt, version);
  if (debt.repayments.length >= maxRecords)
    throw fail(422, '單筆債務已達 5,000 筆還款紀錄上限');
  debt.repayments.push(input);
  checkBalance(debt);
  await debt.save();
  return serializeDebt(debt);
}

async function updateRepayments(debt, body, recordId) {
  const { version, ...input } = schema.repayment
    .extend(schema.version.shape)
    .parse(body);
  checkVersion(debt, version);
  const repayment = debt.repayments.id(recordId);
  if (!repayment) throw fail(404, '找不到還款紀錄');
  Object.assign(repayment, input);
  checkBalance(debt);
  await debt.save();
  return serializeDebt(debt);
}

async function removeRepayments(debt, body, recordId) {
  const { version } = schema.version.parse(body);
  checkVersion(debt, version);
  const repayment = debt.repayments.id(recordId);
  if (!repayment) throw fail(404, '找不到還款紀錄');
  repayment.deleteOne();
  await debt.save();
  return serializeDebt(debt);
}

async function addBorrowings(debt, body) {
  const { version, ...input } = schema.borrowing
    .extend(schema.version.shape)
    .parse(body);
  checkVersion(debt, version);
  if (debt.borrowings.length >= maxRecords - 1)
    throw fail(422, '單筆債務已達 5,000 筆借款紀錄上限');
  debt.borrowings.push(input);
  debt.amount += input.amount;
  checkBalance(debt);
  await debt.save();
  return serializeDebt(debt);
}

async function updateBorrowings(debt, body, recordId) {
  const { version, ...input } = schema.borrowing
    .extend(schema.version.shape)
    .parse(body);
  checkVersion(debt, version);
  const borrowing = debt.borrowings.id(recordId);
  if (!borrowing) throw fail(404, '找不到借款紀錄');
  debt.amount += input.amount - borrowing.amount;
  Object.assign(borrowing, input);
  checkBalance(debt);
  await debt.save();
  return serializeDebt(debt);
}

async function removeBorrowings(debt, body, recordId) {
  const { version } = schema.version.parse(body);
  checkVersion(debt, version);
  const borrowing = debt.borrowings.id(recordId);
  if (!borrowing) throw fail(404, '找不到借款紀錄');
  debt.amount -= borrowing.amount;
  borrowing.deleteOne();
  checkBalance(debt);
  await debt.save();
  return serializeDebt(debt);
}

module.exports = {
  findOwned,
  list,
  create,
  update,
  remove,
  addRepayments,
  updateRepayments,
  removeRepayments,
  addBorrowings,
  updateBorrowings,
  removeBorrowings
};
