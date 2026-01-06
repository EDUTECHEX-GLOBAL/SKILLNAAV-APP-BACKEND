const express = require("express");
const router = express.Router();
const axios = require("axios");
const { getAccessToken } = require("../../utils/paypal");
const Payment = require("../../models/webapp-models/PaymentModel");
const User = require("../../models/webapp-models/userModel");

// Create PayPal order
router.post("/paypal/order", async (req, res) => {
  const { amount, userId, planType, email, duration } = req.body;
  if (!amount || !userId || !planType || !email || !duration)
    return res.status(400).json({ success: false, message: "Missing required fields" });

  try {
    const accessToken = await getAccessToken();
    const value = parseFloat(amount).toFixed(2); // Always ensure string with two decimals

    const response = await axios.post(
      `${process.env.PAYPAL_API}/v2/checkout/orders`,
      {
        intent: "CAPTURE",
        purchase_units: [{
          amount: {
            currency_code: "USD",
            value,
          }
        }]
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({ success: true, id: response.data.id });
  } catch (err) {
    if (err.response) {
      console.error("❌ Error creating PayPal order:", err.response.data);
      res.status(500).json({ success: false, message: "Error creating order", details: err.response.data });
    } else {
      console.error("❌ Error creating PayPal order:", err.message);
      res.status(500).json({ success: false, message: "Error creating order", details: err.message });
    }
  }
});


// Verify and capture payment
// router.post("/paypal/verify", ...)
router.post("/paypal/verify", async (req, res) => {
  const { orderID, userId, planType, amount, email, duration } = req.body;
  if (!orderID || !userId || !planType || !amount || !email || !duration) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  const days = parseInt(duration, 10);
  if (!Number.isFinite(days) || days <= 0) {
    return res.status(400).json({ success: false, message: "Invalid duration" });
  }

  try {
    const accessToken = await getAccessToken();

    // Capture the PayPal order
    await axios.post(
      `${process.env.PAYPAL_API}/v2/checkout/orders/${orderID}/capture`,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Create Payment record (save the expiration we'll apply to user)
    const now = Date.now();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    // Compute premiumExpiration by extending existing expiry if still in future
    const userDoc = await User.findById(userId);
    let baseTime = now;
    if (userDoc && userDoc.premiumExpiration && new Date(userDoc.premiumExpiration).getTime() > now) {
      baseTime = new Date(userDoc.premiumExpiration).getTime();
    }
    const premiumExpiration = new Date(baseTime + days * MS_PER_DAY);

    const payment = new Payment({
      userId,
      planType,
      email,
      amount: amount.toString(),
      paymentId: orderID,
      orderId: orderID,
      status: "Success",
      premiumExpiration,
    });
    await payment.save();

    // Update user with new premium flags and expiry, return fresh user (without password)
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          isPremium: true,
          planType,
          premiumExpiration,
        }
      },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Return consistent wrapper: { user: ... }
    return res.json({ success: true, user: updatedUser });
  } catch (err) {
  const issue = err.response?.data?.details?.[0]?.issue;

  // 🔥 REQUIRED BY PAYPAL
  if (issue === "INSTRUMENT_DECLINED") {
    return res.status(400).json({
      success: false,
      retry: true,
      details: err.response.data,
    });
  }

  console.error("❌ FULL ERROR in /paypal/verify:", err.response?.data || err);

  return res.status(500).json({
    success: false,
    message: "PayPal capture failed",
    details: err.response?.data || null,
  });
}
});



module.exports = router;



// 3️⃣ Get Payment Status API (Optional)
// router.get("/status/:paymentId", async (req, res) => {
//   try {
//     const { paymentId } = req.params;
//     const payment = await Payment.findOne({ paymentId });

//     if (!payment) {
//       return res.status(404).json({ success: false, message: "Payment not found" });
//     }

//     res.json({ success: true, payment });
//   } catch (error) {
//     console.error("Error fetching payment status:", error);
//     res.status(500).json({ success: false, message: "Error fetching payment status" });
//   }
// });


