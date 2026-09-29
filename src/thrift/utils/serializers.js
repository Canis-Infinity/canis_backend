function publicUser(user) { return { id: String(user._id), name: user.name, email: user.email, phone: user.phone, contact: user.contact, role: user.role, status: user.status, version: user.__v }; }
function serialize(doc) { const obj = doc.toObject ? doc.toObject() : doc; const { _id, __v, ...rest } = obj; return { ...rest, id: String(_id), version: __v }; }
module.exports = { publicUser, serialize };
