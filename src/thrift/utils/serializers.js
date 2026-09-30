function publicUser(user) { return { id: String(user._id), name: user.name, email: user.email, phone: user.phone, contact: user.contact, role: user.role, status: user.status, version: user.__v }; }
function serialize(doc) { const obj = doc.toObject ? doc.toObject() : doc; const { _id, __v, ...rest } = obj; return { ...rest, id: String(_id), version: __v }; }
// Orders created before image snapshots use the product ID, including soft-deleted products.
function withOrderImages(order, products) {
  return { ...order, items: order.items.map(item => ({ ...item, image: item.image ?? products.get(item.product)?.images?.[0] ?? null })) };
}
module.exports = { publicUser, serialize, withOrderImages };
