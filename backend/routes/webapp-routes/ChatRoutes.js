const express = require("express");
const router = express.Router();
const {
  getChatMessages,
  sendMessage,
  getMessages,
  sendReply,
} = require("../../controllers/ChatController");

// ✅ Get all messages between a partner and admin for a specific internship
router.get("/partner/:partnerId/internship/:internshipId", getChatMessages);

// ✅ Get all messages for a specific internship (admin view)
router.get("/internship/:internshipId", getMessages);

// ✅ Send a new message
router.post("/send", sendMessage);

// ✅ Send a reply to a message thread
router.post("/reply", sendReply);

module.exports = router;
