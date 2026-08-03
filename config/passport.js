let JwtStrategy = require('passport-jwt').Strategy;
let ExtractJwt = require('passport-jwt').ExtractJwt;
const User = require('../models').user;

module.exports = (passport) => {
  let opts = {};
  opts.jwtFromRequest = ExtractJwt.fromAuthHeaderWithScheme('jwt');
  opts.secretOrKey = process.env.PASSWORD_HASH;

  const normalJwtStrategy = new JwtStrategy(opts, async function (jwt_payload, done) {
    try {
      let foundUser = await User.findOne({ _id: jwt_payload._id });
      if (foundUser) {
        return done(null, foundUser);
      } else {
        return done(null, false);
      }
    } catch (e) {
      return done(e, false);
    }
  });

  passport.use('normalJwtStrategy', normalJwtStrategy);
};
