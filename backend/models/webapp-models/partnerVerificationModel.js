// models/partnerVerificationModel.js
const mongoose = require("mongoose");

const partnerVerificationSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  otp: { type: String, required: true },
  otpExpiration: { type: Date, required: true },
});

const PartnerEmailVerification = mongoose.model(
  "PartnerEmailVerification",
  partnerVerificationSchema
);

module.exports = PartnerEmailVerification;
