const { cookieName } = require('../config');
const cookieOptions = (req) => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: req.secure,
  path: '/'
});
const getToken = (req) =>
  (req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
module.exports = { cookieOptions, getToken };
