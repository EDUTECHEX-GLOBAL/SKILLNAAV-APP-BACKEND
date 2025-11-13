const asyncHandler = require("express-async-handler");
const Payment = require("../../models/webapp-models/schoolAdmin/SchoolAdminPayment");
const SchoolAdmin = require("../../models/webapp-models/schoolAdmin/SchoolAdminModel");
const axios = require("axios");

// 📦 Verify PayPal Order
const verifyPayPalOrder = async (orderId) => {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const { data: authData } = await axios.post(
    "https://api-m.sandbox.paypal.com/v1/oauth2/token",
    new URLSearchParams({ grant_type: "client_credentials" }),
    {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  const { data: orderDetails } = await axios.get(
    `https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}`,
    {
      headers: {
        Authorization: `Bearer ${authData.access_token}`,
      },
    }
  );

  return orderDetails;
};

// 💳 Subscribe Handler
const subscribeToPlan = asyncHandler(async (req, res) => {
  const { plan, orderId } = req.body;
  const adminId = req.schoolAdmin?._id;

  const admin = await SchoolAdmin.findById(adminId);
  if (!admin) return res.status(401).json({ message: "Unauthorized" });

  const order = await verifyPayPalOrder(orderId);
  if (order.status !== "COMPLETED") {
    return res.status(400).json({ message: "Payment not completed." });
  }

  const capture = order?.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture || capture.status !== "COMPLETED") {
    return res.status(400).json({ message: "Invalid or incomplete payment capture." });
  }

  const capturedAmount = parseFloat(capture.amount?.value || "0");
  const currency = capture.amount?.currency_code || "USD";

  // Normalize & set credits to add
  let planInternal;
  let creditsToAdd = 0;

  switch (plan) {
    case "Standard Plan":
      planInternal = "Standard";
      creditsToAdd = 500;
      break;
    case "Premium Plan":
      planInternal = "Premium";
      creditsToAdd = 1000; // or MAX_SAFE_INTEGER
      break;
    default:
      return res.status(400).json({ message: "Invalid plan selected" });
  }

  // ✅ Add credits, don't overwrite
  admin.creditsAvailable += creditsToAdd;

  // ✅ Update plan only if upgrading (Free → Standard, Standard → Premium)
  const plansOrder = { Free: 0, Standard: 1, Premium: 2 };
  if (plansOrder[planInternal] > plansOrder[admin.plan]) {
    admin.plan = planInternal;
  }

  admin.subscriptionStatus = "active";
  await admin.save();

  await Payment.create({
    schoolAdmin: admin._id,
    plan,
    orderId,
    amount: capturedAmount,
    currency,
    status: "COMPLETED",
    rawPayPalResponse: order,
    paymentMethod: order?.payer?.email_address || "paypal",
  });

  res.status(200).json({
    message: `✅ ${plan} activated`,
    creditsAdded: creditsToAdd,
    totalCredits: admin.creditsAvailable,
    plan: admin.plan,
  });
});



module.exports = {
  subscribeToPlan,
  verifyPayPalOrder,
};
