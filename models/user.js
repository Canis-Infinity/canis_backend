const mongoose = require('mongoose');
const { Schema } = mongoose;
const bcrypt = require('bcrypt');

const userSchema = new Schema({
  username: {
    type: String,
    required: true,
    minlength: 6,
    maxlength: 50,
  },
  email: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  lastName: {
    type: String,
    required: true,
  },
  firstName: {
    type: String,
    required: true,
  },
  mobile: {
    type: String,
    required: true,
  },
});

userSchema.index({ username: 1 });

// 註冊時，將密碼加密
userSchema.pre('save', async function (next) {
  const user = this;
  if (user.isNew || user.isModified('password')) {
    const hashValue = await bcrypt.hash(user.password, 10);
    user.password = hashValue;
  }
  next();
});

// 登入時，將密碼解密
userSchema.methods.comparePassword = async function (password, callback) {
  let result;
  try {
    result = await bcrypt.compare(password, this.password);
    return callback(null, result);
  } catch (error) {
    return callback(error, result);
  }
};

module.exports = mongoose.model('User', userSchema);
