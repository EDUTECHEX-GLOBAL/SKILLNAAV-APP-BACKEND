// models/SchoolAdminOTPVerification.js
const mongoose = require("mongoose");

const schoolAdminOTPVerificationSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  otp: { type: String, required: true },
  otpExpiration: { type: Date, required: true },
});

const SchoolAdminOTPVerification = mongoose.model(
  "SchoolAdminOTPVerification",
  schoolAdminOTPVerificationSchema
);

module.exports = SchoolAdminOTPVerification;
