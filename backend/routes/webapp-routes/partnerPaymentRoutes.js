const express = require("express");
const router = express.Router();
const axios = require("axios");
const { getAccessToken } = require("../../utils/paypal");
const PartnerPayment = require("../../models/webapp-models/PartnerPaymentModel");
const Partner = require("../../models/webapp-models/partnerModel");

// 1) Create PayPal order
router.post("/paypal/order", async (req, res) => {
  const { amount, partnerId, planType, email, duration } = req.body;
  if (
    amount === undefined ||
    !partnerId ||
    !planType ||
    !email ||
    duration === undefined
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Missing required fields" });
  }

  try {
    const accessToken = await getAccessToken();
    const value = parseFloat(amount).toFixed(2);

    const response = await axios.post(
      `${process.env.PAYPAL_API}/v2/checkout/orders`,
      {
        intent: "CAPTURE",
        purchase_units: [{ amount: { currency_code: "USD", value } }],
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.json({ success: true, id: response.data.id });
  } catch (err) {
    console.error("❌ Error creating PayPal order:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Error creating order" });
  }
});

// 2) Verify & record the already-captured payment
router.post("/paypal/verify", async (req, res) => {
  const { orderID, partnerId, planType, amount, email, duration } = req.body;
  if (
    amount === undefined ||
    !partnerId ||
    !planType ||
    !email ||
    duration === undefined
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Missing required fields" });
  }

  try {
    const premiumExpiration = new Date();
    premiumExpiration.setMonth(
      premiumExpiration.getMonth() + parseInt(duration, 10)
    );

    const payment = new PartnerPayment({
      partnerId,
      planType,
      email,
      amount: amount.toString(),
      paymentId: orderID,
      status: "Success",
      premiumExpiration,
    });
    await payment.save();

    const updatedPartner = await Partner.findByIdAndUpdate(
      partnerId,
      {
        isPremium: true,
        planType,
        premiumExpiration,
      },
      { new: true }
    );

    if (!updatedPartner) {
      return res
        .status(404)
        .json({ success: false, message: "Partner not found" });
    }

    return res.json({ success: true, partner: updatedPartner });
  } catch (err) {
    console.error("❌ Error in /paypal/verify:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Verification failed" });
  }
});

module.exports = router;