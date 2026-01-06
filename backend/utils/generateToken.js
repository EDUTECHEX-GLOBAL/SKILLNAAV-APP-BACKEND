// In utils/generateToken.js

const jwt = require("jsonwebtoken");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    // MODIFIED: Set expiration to 60 seconds (1 minute)
    expiresIn: "2d", 
  });
};

module.exports = generateToken;