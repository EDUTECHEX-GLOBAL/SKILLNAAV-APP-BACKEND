const express = require("express");
const router = express.Router();
const {
  createNotification,
  getNotificationsByStudent,
  markNotificationAsRead,
  deleteNotification,
} = require("../../controllers/NotificationController");

// ✅ Create/send a notification (can be called from partner.py)
router.post("/", createNotification);

// 🔁 Get all notifications for a student
router.get("/:studentId", getNotificationsByStudent);

// ✅ Mark one notification as read
router.put("/read/:notificationId", markNotificationAsRead);

// ❌ Delete notification
router.delete("/:notificationId", deleteNotification);

module.exports = router;
