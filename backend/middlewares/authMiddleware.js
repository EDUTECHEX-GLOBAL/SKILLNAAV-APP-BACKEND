// middlewares/authMiddleware.js
const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const Userwebapp = require("../models/webapp-models/userModel");
const Partnerwebapp = require("../models/webapp-models/partnerModel");

const getTokenFromReq = (req) => {
  // 1) Authorization: Bearer <token>
  const auth = req.headers.authorization || req.headers.Authorization;
  if (auth && typeof auth === "string" && auth.startsWith("Bearer ")) {
    const t = auth.split(" ")[1];
    if (t && t !== "undefined" && t !== "null") return t;
  }
  // 2) Cookie
  if (req.cookies?.token) return req.cookies.token;
  // 3) Query (useful for websockets/webhooks if you choose)
  if (req.query?.token) return req.query.token;
  return null;
};

// Authenticate user or partner
const authenticate = asyncHandler(async (req, res, next) => {
  // Skip auth for preflight OPTIONS
  if (req.method === "OPTIONS") return res.sendStatus(204);

  const token = getTokenFromReq(req);
  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token" }); // <-- return!
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ message: "Not authorized, token invalid" }); // <-- return!
  }

  // Try user first, then partner
  let entity =
    (await Userwebapp.findById(decoded.id).select("-password")) ||
    (await Partnerwebapp.findById(decoded.id).select("-password"));

  if (!entity) {
    return res.status(401).json({ message: "Not authorized" }); // <-- return!
  }

  req.user = entity;
  req.isPartner = !!(await Partnerwebapp.findById(decoded.id).select("_id"));
  next();
});

// Only partners
const authorizePartner = (req, res, next) => {
  if (!req.isPartner) {
    return res.status(403).json({ message: "Not authorized as partner" });
  }
  next();
};

// Only admins (of Userwebapp)
const authorizeAdmin = (req, res, next) => {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ message: "Not authorized as admin" });
  }
  next();
};

module.exports = { authenticate, authorizePartner, authorizeAdmin };
