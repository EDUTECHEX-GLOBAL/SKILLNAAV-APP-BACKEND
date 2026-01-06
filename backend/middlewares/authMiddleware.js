const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const Userwebapp = require("../models/webapp-models/userModel");
const Partnerwebapp = require("../models/webapp-models/partnerModel");

const authenticate = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];

    try {
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (err) {
        // Explicitly handle expired token
        if (err.name === "TokenExpiredError") {
          return res.status(401).json({
            success: false,
            message: "Token expired",
            code: "TOKEN_EXPIRED",
            expiredAt: err.expiredAt,
          });
        }
        // Other JWT errors
        return res.status(401).json({
          success: false,
          message: "Not authorized, token invalid",
          code: "TOKEN_INVALID",
        });
      }

      // Try find user first
      let user = await Userwebapp.findById(decoded.id).select("-password");

      // If not a user, try partner
      let isPartner = false;
      if (!user) {
        user = await Partnerwebapp.findById(decoded.id).select("-password");
        if (user) isPartner = true;
      }

      if (!user) {
        return res.status(401).json({ success: false, message: "Not authorized", code: "NOT_FOUND" });
      }

      req.user = user;
      req.isPartner = isPartner;
      next();
    } catch (error) {
      console.error("Auth middleware error:", error);
      return res.status(401).json({ success: false, message: "Not authorized", code: "AUTH_ERROR" });
    }
  } else {
    return res.status(401).json({ success: false, message: "Not authorized, no token", code: "NO_TOKEN" });
  }
});

// Middleware to authorize only partners
const authorizePartner = asyncHandler(async (req, res, next) => {
  if (!req.isPartner) {
    return res.status(403).json({ 
      message: "Not authorized as partner" 
    });
  }
  next();
});

// Middleware to authorize only admin users
const authorizeAdmin = asyncHandler(async (req, res, next) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ 
      message: "Not authorized as admin" 
    });
  }
  next();
});

module.exports = {
  authenticate,
  authorizePartner,
  authorizeAdmin
};