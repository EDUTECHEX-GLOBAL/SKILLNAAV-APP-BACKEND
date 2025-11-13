const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken"); // ⬅️ Needed to decode token
const askMistral = require("../services/bedrockChat");
const {
  listCompanies,
  listTypes,
  listModes,
} = require("../services/ragHelpers");

const Userwebapp = require("../models/webapp-models/userModel"); // ⬅️ Import User model

// Regex patterns
const GREET_RX = /^(hi|hello|hey|howdy|good\s*(morning|afternoon|evening)|how\s*are\s*you)\b/i;
const ALLOWED_RX = /(skill\s*naav|internship|career|resume|cv|job|schedule|partner)/i;

// POST /api/career-chat
router.post("/career-chat", async (req, res) => {
  const { message = "" } = req.body;
  const token = req.headers.authorization?.split(" ")[1];

  // 1️⃣ Authenticate user via token
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  let userId;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // ⬅️ Use your JWT secret
    userId = decoded.id;
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }

  const user = await Userwebapp.findById(userId);

  if (!user) return res.status(404).json({ error: "User not found" });

  const isPremium = user.isPremium && new Date(user.premiumExpiration) > new Date();

  // 2️⃣ Freemium limit check
  if (!isPremium && (user.careerChatUsage ?? 0) >= 10) {
    return res.json({
      reply: `⚠️ You’ve used all 10 free replies. Upgrade to Premium for unlimited chat.`,
    });
  }

  // 3️⃣ Greetings
  if (GREET_RX.test(message.trim())) {
    return res.json({
      reply: "Hello! 👋 How can I help you?",
    });
  }

  // 4️⃣ Off-topic
  if (!ALLOWED_RX.test(message)) {
    return res.json({
      reply: "I’m sorry, I can’t assist you with that.",
    });
  }

  // 5️⃣ Dynamic context (RAG)
  let ctx = "";

  if (/(which|what).*companies?.*internship|list.*companies/i.test(message)) {
    const companies = await listCompanies();
    if (companies.length) {
      ctx += `\n\n**COMPANIES:**\n${companies.map((c) => "• " + c).join("\n")}\n`;
    }
  }

  if (/(which|what).*types?.*internship|paid|free|stipend/i.test(message)) {
    const types = await listTypes();
    if (types.length) {
      ctx += `\n\n**TYPES:**\n${types.map((t) => "• " + t).join("\n")}\n`;
    }
  }

  if (/(online|offline|hybrid).*internship/i.test(message)) {
    const modes = await listModes();
    if (modes.length) {
      ctx += `\n\n**MODES:**\n${modes.map((m) => "• " + m).join("\n")}\n`;
    }
  }

  const promptForAI = ctx ? `${ctx}\n\nUser: ${message}` : message;

  // 6️⃣ Forward to Bedrock
  try {
    const reply = await askMistral(promptForAI);

    // 7️⃣ Update usage only for freemium users
    if (!isPremium) {
      user.careerChatUsage = (user.careerChatUsage ?? 0) + 1;
      await user.save();
    }

    return res.json({ reply });
  } catch (err) {
    console.error("Bedrock error:", err);
    return res.status(500).json({ error: "Something went wrong with the AI service." });
  }
});

module.exports = router;
