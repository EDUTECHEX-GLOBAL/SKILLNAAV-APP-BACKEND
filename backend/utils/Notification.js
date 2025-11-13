const Notification = require('../models/webapp-models/NotificationModel');

const sendNotification = async ({ studentId, title, message, link = null, type }) => {
  // Validate required fields
  if (!studentId || !title || !message) {
    throw new Error('Missing required fields for notification');
  }

  // Auto-set type if not provided, based on title keywords
  let finalType = type;
  if (!finalType) {
    const titleLower = title.toLowerCase();
    if (titleLower.includes("offer")) {
      finalType = "offer";
    } else if (titleLower.includes("recommendation")) {
      finalType = "recommendation";
    } else {
      finalType = "general";
    }
  }

  // Create a new Notification document
  const notification = new Notification({
    studentId,
    title,
    message,
    link,
    type: finalType,  // Guaranteed to be set
    isRead: false
  });

  // Save notification to the database
  await notification.save();

  return notification;
};

module.exports = sendNotification;
