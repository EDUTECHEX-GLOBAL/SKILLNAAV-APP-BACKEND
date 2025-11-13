const mongoose = require("mongoose");

const partnerPaymentSchema = new mongoose.Schema({
  partnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Partnerwebapp",
    required: true,
  },
  planType: {
    type: String,
    enum: ["Freemium", "Premium Basic", "Premium Plus"],
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  amount: {
    type: String,
    required: true,
  },
  paymentId: String,
  orderId: String,
  status: {
    type: String,
    enum: ["Pending", "Success", "Failed"],
    default: "Pending",
  },
  premiumExpiration: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("PartnerPayment", partnerPaymentSchema);
