// backend/routes/feedbackExport.js
const express = require("express");
const router = express.Router();
const Feedback = require("../../models/webapp-models/Feedback");
const { Parser } = require("json2csv");

router.get("/export", async (req, res) => {
  try {
    const { flow, from, to } = req.query;
    const filter = {};
    if (flow) filter.flow = flow;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const items = await Feedback.find(filter).sort({ createdAt: -1 }).lean();

    // Map to flat CSV rows
    const rows = items.map(f => ({
      id: f._id,
      flow: f.flow,
      userId: f.userId || "",
      userName: f.userName || "",
      userEmail: f.userEmail || (f.answers && f.answers.contactEmail) || "",
      page: f.page || "",
      timestamp: f.createdAt,
      overallRating: f.answers?.overall ?? "",
      nps: f.answers?.nps ?? "",
      followUp: f.answers?.followUp ?? "",
      shortNotes: (f.answers && (f.answers.issueDesc || f.answers.confusing || f.answers.suggestions)) || ""
    }));

    const parser = new Parser();
    const csv = parser.parse(rows);

    res.header("Content-Type", "text/csv");
    res.attachment(`feedback_export_${flow || "all"}_${Date.now()}.csv`);
    return res.send(csv);
  } catch (err) {
    console.error("Export CSV error", err);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
