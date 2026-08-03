const jwt = require('jsonwebtoken');
const User = require('../../models').user;

function comparePassword(user, password) {
  return new Promise((resolve, reject) => {
    user.comparePassword(password, (error, isMatch) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(isMatch);
    });
  });
}

async function registerUser(data) {
  const userExist = await User.findOne({ username: data.username }).lean();
  if (userExist) {
    const error = new Error('使用者已經被註冊過了');
    error.statusCode = 400;
    throw error;
  }

  return new User(data).save();
}

async function loginUser({ username, password }) {
  const foundUser = await User.findOne({ username });
  if (!foundUser) {
    const error = new Error('找不到使用者，請確認使用者名稱是否正確');
    error.statusCode = 401;
    throw error;
  }

  const isMatch = await comparePassword(foundUser, password);
  if (!isMatch) {
    const error = new Error('密碼錯誤');
    error.statusCode = 401;
    throw error;
  }

  const tokenObject = { _id: foundUser._id, username: foundUser.username };
  const token = jwt.sign(tokenObject, process.env.PASSWORD_HASH);
  const user = foundUser.toObject();
  delete user.password;
  return {
    token: `JWT ${token}`,
    user,
  };
}

module.exports = {
  loginUser,
  registerUser,
};
