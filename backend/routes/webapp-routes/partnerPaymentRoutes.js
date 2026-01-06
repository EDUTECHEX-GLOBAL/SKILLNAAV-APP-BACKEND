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


// router.post("/paypal/verify", ...)
router.post("/paypal/verify", async (req, res) => {
  const { orderID, partnerId, planType, amount, email, duration } = req.body;

  if (!orderID || !partnerId || !planType || amount === undefined || duration === undefined) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  try {
    const accessToken = await getAccessToken();

    // CAPTURE the order (this performs the money transfer attempt)
    let captureResp;
    try {
      captureResp = await axios.post(
        `${process.env.PAYPAL_API}/v2/checkout/orders/${orderID}/capture`,
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (captureErr) {
      // If PayPal responds with instrument declined, surface that to client to retry
      const pd = captureErr.response?.data;
      if (pd && Array.isArray(pd.details) && pd.details[0]?.issue === "INSTRUMENT_DECLINED") {
        console.warn("PayPal: instrument declined for order", orderID, pd.details[0]?.description);
        return res.status(402).json({
          success: false,
          retry: true,
          message: "Payment instrument declined. Please try another funding source.",
          details: pd,
        });
      }

      console.error("PayPal capture error:", pd || captureErr.message || captureErr);
      return res.status(500).json({
        success: false,
        message: "Payment capture failed. Try again or contact support.",
        details: pd || captureErr.message,
      });
    }

    const captureData = captureResp.data;
    const purchaseUnit = captureData.purchase_units?.[0];
    const captures = purchaseUnit?.payments?.captures || [];
    const anyCaptureCompleted = captures.some((c) => c.status === "COMPLETED" || c.status === "COMPLETED_WITH_PAYOUT");

    if (!anyCaptureCompleted) {
      console.warn("PayPal capture did not complete", { orderID, status: captureData.status, captures });
      return res.status(400).json({ success: false, message: "Payment not completed after capture." });
    }

    // Use capture amount (first capture)
    const captureAmountStr = captures[0]?.amount?.value;
    const paypalAmount = captureAmountStr ? parseFloat(captureAmountStr) : NaN;
    if (Number.isNaN(paypalAmount)) {
      console.warn("Invalid capture amount", { captureAmountStr });
      return res.status(400).json({ success: false, message: "Invalid capture amount returned by PayPal." });
    }

    // Validate amounts (allow tiny rounding difference)
    if (Math.abs(paypalAmount - parseFloat(amount)) > 0.05) {
      console.warn("Amount mismatch", { expected: parseFloat(amount), paypalAmount });
      return res.status(400).json({ success: false, message: "Amount mismatch with PayPal capture." });
    }

    // Ensure partner exists
    const partner = await Partner.findById(partnerId);
    if (!partner) return res.status(404).json({ success: false, message: "Partner not found" });

    // Compute expiration in days (duration expected as days)
    const days = parseInt(duration, 10);
    if (!Number.isFinite(days) || days <= 0) {
      return res.status(400).json({ success: false, message: "Invalid duration" });
    }
    // Extend from now (or optionally extend from existing expiry — choose behavior)
    const now = Date.now();
    const premiumExpiration = new Date(now + days * 24 * 60 * 60 * 1000);

    // Idempotency: avoid duplicate payment records
    const existingPayment = await PartnerPayment.findOne({ paymentId: orderID });
    if (!existingPayment) {
      await PartnerPayment.create({
        partnerId,
        planType,
        email: email || captureData.payer?.email_address,
        amount: paypalAmount.toString(),
        paymentId: orderID,
        status: "Success",
        premiumExpiration,
      });
    } else {
      // If existed but partner not upgraded, repair partner below
      console.info("Payment already recorded:", orderID);
    }

    // Update partner record
    const updatedPartner = await Partner.findByIdAndUpdate(
      partnerId,
      {
        isPremium: true,
        planType,
        premiumExpiration,
      },
      { new: true }
    );

    // Optional realtime emit if io is attached to app
    try {
      const io = req.app?.get?.("io");
      if (io) {
        io.to(`partner_${partnerId}`).emit("partner:updated", {
          partnerId: partnerId.toString(),
          isPremium: true,
          planType: updatedPartner.planType,
          premiumExpiration: updatedPartner.premiumExpiration,
        });
      }
    } catch (emitErr) {
      console.warn("Failed to emit partner:updated:", emitErr);
    }

    return res.json({ success: true, partner: updatedPartner });
  } catch (err) {
    console.error("❌ PayPal verify error:", err.response?.data || err.message || err);
    return res.status(500).json({ success: false, message: "Verification failed" });
  }
});



module.exports = router;