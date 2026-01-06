// utils/checkpremiumExipiration.js
const cron = require("node-cron");
const mongoose = require("mongoose");
const User = require("../models/webapp-models/userModel");

// Helper to run the expiry job
async function runExpiryJob() {
  try {
    const now = new Date();

    // Find expired premium users (isPremium true AND premiumExpiration <= now)
    const expiredUsers = await User.find({
      isPremium: true,
      premiumExpiration: { $lte: now },
    }).select("_id");

    if (!expiredUsers || expiredUsers.length === 0) {
      console.log("✔ Cron: No expired users found.");
      return;
    }

    const userIds = expiredUsers.map((u) => u._id);

    const updateResult = await User.updateMany(
      { _id: { $in: userIds } },
      {
        $set: {
          isPremium: false,
          planType: "Free",
          premiumExpiration: null,
        },
      }
    );

    console.log(
      `✔ Cron: Expired premium cleared for ${expiredUsers.length} users. updateResult:`,
      {
        matched: updateResult.matchedCount ?? updateResult.n,
        modified: updateResult.modifiedCount ?? updateResult.nModified,
      }
    );
  } catch (err) {
    console.error("❌ Cron Error (runExpiryJob):", err);
  }
}

// Schedule helper which ensures mongoose is ready
function scheduleCron() {
  // Cron expression: currently runs daily at 00:00 (midnight) UTC.
  // If you prefer local timezone, set timezone accordingly (e.g., "Asia/Kolkata").
  const cronExpr = "0 0 * * *"; // daily at 00:00
  const timezone = "UTC";

  // Uncomment for testing (run every minute) and *then* revert
  // const cronExpr = "* * * * *"; // every minute (testing only)

  cron.schedule(
    cronExpr,
    () => {
      console.log(`⏱ Cron triggered at ${new Date().toISOString()} (${timezone}).`);
      runExpiryJob();
    },
    {
      timezone,
    }
  );

  console.log(`✔ Cron scheduled (${cronExpr}) with timezone ${timezone}`);
}

// If mongoose is already connected, schedule immediately; otherwise wait for connection
if (mongoose.connection.readyState === 1) {
  scheduleCron();
} else {
  mongoose.connection.on("connected", () => {
    console.log("✔ Mongoose connected — scheduling premium expiry cron.");
    scheduleCron();
  });

  // Also handle reconnects (optional)
  mongoose.connection.on("reconnected", () => {
    console.log("✔ Mongoose reconnected — ensuring cron scheduled.");
    // scheduling multiple times harmless if you guard against duplicates,
    // but here we only schedule once on 'connected' or 'reconnected' events as needed.
  });
}

// Export the run function for manual invocation in tests if needed
module.exports = { runExpiryJob };
