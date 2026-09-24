const publicUser = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  version: user.__v,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  reviewedAt: user.reviewedAt
});
const serializeDebt = (doc) => {
  const obj = doc.toObject();
  const paid = obj.repayments.reduce((sum, item) => sum + item.amount, 0);
  const borrowings = (obj.borrowings || []).map((item) => ({
    ...item,
    id: String(item._id)
  }));
  const initialAmount =
    obj.amount - borrowings.reduce((sum, item) => sum + item.amount, 0);
  return {
    ...obj,
    id: String(obj._id),
    version: obj.__v,
    paid,
    remaining: obj.amount - paid,
    initialAmount,
    borrowings,
    repayments: obj.repayments.map((item) => ({
      ...item,
      id: String(item._id)
    }))
  };
};

module.exports = { publicUser, serializeDebt };
