// utils/checkPartnerPremiumExpiration.js

const cron = require("node-cron");
const mongoose = require("mongoose");
const Partner = require("../models/webapp-models/partnerModel");

let scheduled = false;
let task = null;

/**
 * Run expiry job: find partners whose premiumExpiration <= now,
 * downgrade them to Freemium and optionally emit realtime events (if `io` provided).
 *
 * @param {Server|null} io - optional socket.io server instance for realtime notifications
 */
async function runPartnerExpiryJob(io = null) {
  try {
    const now = new Date();

    const expiredPartners = await Partner.find({
      isPremium: true,
      premiumExpiration: { $lte: now },
    }).select("_id email name premiumExpiration");

    if (!expiredPartners.length) {
      console.log("✔ Partner Cron: No expired partner subscriptions.");
      return { downgrades: 0 };
    }

    const partnerIds = expiredPartners.map((p) => p._id);

    const result = await Partner.updateMany(
      { _id: { $in: partnerIds } },
      {
        $set: {
          isPremium: false,
          planType: "Freemium", // ensure this matches your enum
          premiumExpiration: null,
        },
      }
    );

    const modified = result.modifiedCount ?? result.nModified ?? 0;

    console.log(`✔ Partner Cron: Downgraded ${modified} partner(s).`);

    // Optional realtime update
    if (io) {
      partnerIds.forEach((id) => {
        try {
          io.to(`partner_${id}`).emit("partner:updated", {
            partnerId: id.toString(),
            isPremium: false,
            planType: "Freemium",
            premiumExpiration: null,
          });
        } catch (emitErr) {
          console.warn("Partner Cron: failed emitting update for", id.toString(), emitErr);
        }
      });
      console.log("✔ Partner Cron: realtime notifications sent.");
    }

    return { downgrades: modified };
  } catch (err) {
    console.error("❌ Partner Cron Error (runPartnerExpiryJob):", err);
    throw err;
  }
}

/**
 * Start the cron job.
 *
 * Options:
 *  - io: optional socket.io server instance (passed to runPartnerExpiryJob for emits)
 *  - cronExpr: cron expression (default hourly "0 * * * *")
 *  - timezone: timezone string (default from env or "Asia/Kolkata")
 */
function startPartnerCron({ io = null, cronExpr = "0 * * * *", timezone = process.env.PARTNER_CRON_TZ || "Asia/Kolkata" } = {}) {
  if (scheduled) {
    console.log("✔ Partner Cron: already scheduled — skipping duplicate start.");
    return;
  }

  // Helper that actually schedules and stores the task
  function scheduleNow() {
    if (scheduled) return;
    scheduled = true;

    console.log(`⏳ Scheduling Partner Premium Expiry Cron (${cronExpr}) timezone=${timezone}`);

    task = cron.schedule(
      cronExpr,
      () => {
        console.log(`⏱ Partner Cron triggered at ${new Date().toISOString()} (${timezone})`);
        runPartnerExpiryJob(io).catch((err) => {
          console.error("❌ Partner Cron job error:", err);
        });
      },
      { timezone }
    );

    console.log("✔ Partner Cron scheduled.");
  }

  // If mongoose already connected, schedule immediately
  if (mongoose.connection.readyState === 1) {
    scheduleNow();
  } else {
    // Otherwise wait for the connected event once (avoids scheduling before DB ready)
    const onConnected = () => {
      console.log("✔ Mongoose connected — scheduling partner cron.");
      scheduleNow();
      mongoose.connection.removeListener("connected", onConnected);
    };
    mongoose.connection.on("connected", onConnected);
  }
}

/**
 * Stop the cron (useful for tests or graceful shutdown).
 */
function stopPartnerCron() {
  if (task) {
    task.stop();
    task = null;
  }
  scheduled = false;
  console.log("✔ Partner Cron stopped.");
}

module.exports = {
  startPartnerCron,
  runPartnerExpiryJob,
  stopPartnerCron,
};
