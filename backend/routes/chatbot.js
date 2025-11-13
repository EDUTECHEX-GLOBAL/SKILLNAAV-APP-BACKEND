const express = require("express");
const askMistral = require("../utils/askMistral");
const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { message, partnerId, featureIndex } = req.body;

    if (!message || !partnerId) {
      return res.status(400).json({ error: "Message and partnerId are required" });
    }

    const reply = await askMistral(message, partnerId, featureIndex);
    res.json({ reply });
  } catch (err) {
    console.error("Chatbot error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
