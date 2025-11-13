const mongoose = require("mongoose");

const schoolAdminPaymentSchema = new mongoose.Schema(
  {
    schoolAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolAdmin",
      required: true,
    },
    plan: {
      type: String,
      enum: ["Free Plan", "Standard Plan", "Premium Plan"],
      required: true,
    },
    orderId: {
      type: String,
      required: true,
      unique: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED"],
      default: "PENDING",
    },
    rawPayPalResponse: {
      type: Object,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SchoolAdminPayment", schoolAdminPaymentSchema);
