const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const SchoolAdmin = require("../models/webapp-models/schoolAdmin/SchoolAdminModel");

const protectSchool = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      console.log("🔐 Token received:", token);

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log("✅ Token decoded:", decoded);

      const admin = await SchoolAdmin.findById(decoded.id).select("-password");
      if (!admin) {
        console.log("❌ Admin not found for ID:", decoded.id);
        throw new Error("Not authorized: admin not found");
      }

      req.schoolAdmin = admin;
      next();
    } catch (err) {
      console.error("❌ Token verification failed:", err.message);
      res.status(401);
      throw new Error("Not authorized, token failed");
    }
  } else {
    console.warn("❌ No token provided");
    res.status(401);
    throw new Error("Not authorized, no token");
  }
});

module.exports = { protectSchool };
