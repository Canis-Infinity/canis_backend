const passport = require('passport');

require('../../config/passport')(passport);

const requireNormalAuth = passport.authenticate('normalJwtStrategy', { session: false });
const authenticateNormal = (callback) =>
  passport.authenticate('normalJwtStrategy', { session: false }, callback);

module.exports = {
  authenticateNormal,
  requireNormalAuth,
};
