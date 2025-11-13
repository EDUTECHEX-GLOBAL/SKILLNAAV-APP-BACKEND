const Chat = require("../models/webapp-models/ChatModel");
const Userwebapp = require("../models/webapp-models/userModel");
// Assuming process.env variables are loaded in your entry file (e.g., server.js)
const ADMIN_RECEIVER_ID = process.env.ADMIN_RECEIVER_ID;


/**
 * ✅ Get chat messages between Admin & Partner for a specific internship
 */
const getChatMessages = async (req, res) => {
  const { internshipId, partnerId } = req.params;

  console.log("📩 Fetching messages for internshipId:", internshipId, "partnerId:", partnerId);

  try {
    if (!internshipId || !partnerId) {
      return res
        .status(400)
        .json({ error: "Internship ID and Partner ID are required." });
    }

    // 🛑 CRITICAL FIX: To ensure ALL messages in the thread are returned,
    // we must check if the internship ID matches AND the message involves EITHER the partner OR the admin.
    // If you're confident that all messages for this internship MUST be between the partner/admin, 
    // the simpler filter below is more reliable.

    // We'll keep the logic that ensures the messages belong to the thread (internship ID) 
    // and that the calling partner is involved (sender or receiver).
    // If the Admin's message is not being included, the most likely cause is an ID mismatch 
    // or an issue with the OR query. We will test the ID mismatch theory.

    const adminId = ADMIN_RECEIVER_ID; // Use the environment variable for the Admin ID in the fetch

    const messages = await Chat.find({
      internship: internshipId,
      // Check if the message is from the Partner, to the Partner, or involves the Admin
      $or: [
        { sender: partnerId },
        { receiver: partnerId },
        { sender: adminId },
        { receiver: adminId }
      ],
    }).sort({ createdAt: 1 });

    // 💡 If the simple $or logic was failing, this expanded check should cover all cases.
    // The previous logic was technically sufficient, so if this STILL fails, the IDs are mismatched.

    console.log(`✅ Found ${messages.length} messages for partnerId ${partnerId}`);

    return res.status(200).json(messages || []);
  } catch (err) {
    console.error("❌ Error fetching chat messages:", err);
    return res.status(500).json({
      error: "Failed to fetch chat messages",
      details: err.message,
    });
  }
};


/**
 * ✅ Admin/Partner sends a new message (UPDATED: Receiver ID from .env)
 */
const sendMessage = async (req, res) => {
  // 🛑 Removed receiverId from destructuring. The client no longer sends it.
  const { internshipId, senderId, message } = req.body;

  // 💡 Server-side receiver resolution
  const receiverId = ADMIN_RECEIVER_ID;

  try {
    // 🛑 Added check for ADMIN_RECEIVER_ID
    if (!internshipId || !senderId || !receiverId || !message?.trim()) {
      // Log more helpful error if receiverId is missing
      if (!receiverId) {
        console.error("❌ ADMIN_RECEIVER_ID is not set in environment variables.");
      }
      return res.status(400).json({ error: "Missing one or more required fields (internshipId, senderId, message, or Admin ID)." });
    }

    const newMessage = await Chat.create({
      internship: internshipId,
      sender: senderId,
      receiver: receiverId, // <-- Uses ID from environment variable
      message: message.trim(),
    });

    console.log("💬 New message created:", newMessage);

    // If using Socket.IO, emit the message to the room (internshipId)
    if (req.io) {
      req.io.to(internshipId).emit("newMessage", newMessage);
    }

    return res.status(201).json(newMessage);
  } catch (err) {
    console.error("❌ Error sending message:", err);
    return res
      .status(500)
      .json({ error: "Failed to send message", details: err.message });
  }
};


/**
 * ✅ Reply to an existing chat thread (UPDATED: Receiver ID from .env)
 */
const sendReply = async (req, res) => {
  // 🛑 Removed receiverId from destructuring.
  const { internshipId, senderId, message } = req.body;

  // 💡 Server-side receiver resolution
  const receiverId = ADMIN_RECEIVER_ID;

  try {
    // 🛑 Added check for ADMIN_RECEIVER_ID
    if (!internshipId || !senderId || !receiverId || !message?.trim()) {
      if (!receiverId) {
        console.error("❌ ADMIN_RECEIVER_ID is not set in environment variables for reply.");
      }
      return res.status(400).json({ error: "Missing one or more required fields (internshipId, senderId, message, or Admin ID)." });
    }

    const newMessage = await Chat.create({
      internship: internshipId,
      sender: senderId,
      receiver: receiverId, // <-- Uses ID from environment variable
      message: message.trim(),
    });

    console.log("↩️ Reply created:", newMessage);

    if (req.io) {
      req.io.to(internshipId).emit("newMessage", newMessage);
    }

    return res.status(201).json(newMessage);
  } catch (err) {
    console.error("❌ Error sending reply:", err);
    return res
      .status(500)
      .json({ error: "Failed to send reply", details: err.message });
  }
};



/**
 * ✅ Get all messages for a specific internship (no partner filter)
 */
const getMessages = async (req, res) => {
  const { internshipId } = req.params;

  console.log("📥 Fetching all messages for internshipId:", internshipId);

  try {
    if (!internshipId) {
      return res.status(400).json({ error: "Internship ID is required." });
    }

    const messages = await Chat.find({ internship: internshipId }).sort({
      createdAt: 1,
    });

    console.log(`✅ Found ${messages.length} messages for internshipId ${internshipId}`);

    return res.status(200).json(messages || []);
  } catch (err) {
    console.error("❌ Error fetching messages:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch messages", details: err.message });
  }
};

module.exports = {
  getChatMessages,
  sendMessage,
  sendReply,
  getMessages,
};