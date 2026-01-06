// backend/routes/feedback.js
const express = require("express");
const router = express.Router();
const Feedback = require("../../models/webapp-models/Feedback");
const User = require("../../models/webapp-models/userModel");
const Partner = require("../../models/webapp-models/partnerModel");
const SchoolAdmin = require("../../models/webapp-models/schoolAdmin/SchoolAdminModel");

const PDFDocument = require("pdfkit");

// Custom date formatting function
function formatDate(date, formatStr = 'PPP') {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "Invalid date";
  
  if (formatStr === 'PPP') {
    // Example: Jan 2, 2025
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } else if (formatStr === 'PPpp') {
    // Example: Jan 2, 2025, 2:33 PM
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } else if (formatStr === 'PPPpp') {
    // Example: Jan 2, 2025, 2:33:33 PM
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
  
  // Default fallback
  return d.toLocaleDateString();
}

// Helper function to split text to fit within width
function splitTextToSize(text, width, options = {}) {
  const defaultOptions = {
    fontSize: 11,
    font: 'Helvetica',
    ...options
  };
  
  // Simple character-based splitting (PDFKit doesn't have splitTextToSize built-in)
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    // Estimate width based on character count (rough estimate)
    const estimatedWidth = testLine.length * (defaultOptions.fontSize * 0.6);
    
    if (estimatedWidth > width && currentLine !== '') {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}

// Updated canonical question sets with proper labels
const canonicalQuestionSets = {
  user: [
    { id: "overall", label: "1) Overall, how would you rate your experience today?", type: "rating" },
    { id: "findEase", label: "2) How easy was it to find relevant internships/jobs? (1-5)", type: "rating" },
    { id: "issueEncountered", label: "3) Did you face any issues while applying or saving a job?", type: "boolean" },
    { id: "issueDesc", label: "If yes, briefly describe", type: "text" },
    { id: "descriptionClarity", label: "4) How clear was the job description (1-5)?", type: "rating" },
    { id: "performance", label: "5) How responsive/fast did the site feel (1-5)?", type: "rating" },
    { id: "featureUsed", label: "6) Feature used most today", type: "text" },
    { id: "confusing", label: "7) Anything confusing or broken? (short)", type: "text" },
    { id: "nps", label: "8) How likely are you to recommend Skillnaav? (0-10)", type: "nps" },
    { id: "suggestions", label: "9) Suggestions to improve internship discovery", type: "text" },
    { id: "followUp", label: "10) Would you like follow-up from Skillnaav?", type: "boolean" },
    { id: "contactEmail", label: "If yes, email:", type: "email" }
  ],
  partner: [
    { id: "overall_partner", label: "1) Overall, how would you rate your partner dashboard experience?", type: "rating" },
    { id: "postEase", label: "2) How easy was it to post an internship/job?", type: "rating" },
    { id: "approvalClarity", label: "3) How clear was the approval/status process?", type: "rating" },
    { id: "toolsUsed", label: "4) Which tool did you use most?", type: "text" },
    { id: "issues_partner", label: "5) Did you face any issues while posting?", type: "boolean" },
    { id: "issueDesc_partner", label: "If yes, describe", type: "text" },
    { id: "timeToPost", label: "6) Approx time taken to post (minutes)", type: "text" },
    { id: "improvements_partner", label: "7) What would improve partner experience?", type: "text" },
    { id: "followUp_partner", label: "8) Want a partner manager follow-up?", type: "boolean" },
    { id: "contactEmail_partner", label: "If yes, email", type: "email" }
  ],
  schoolAdmin: [
    { id: "overall_school", label: "1) Overall, how was the school admin experience?", type: "rating" },
    { id: "reviewFlow", label: "2) How easy is it to review partner postings (1-5)?", type: "rating" },
    { id: "tools_school", label: "3) Which action did you perform?", type: "text" },
    { id: "issue_school", label: "4) Did you face issues with the moderation tools?", type: "boolean" },
    { id: "issueDesc_school", label: "If yes, describe", type: "text" },
    { id: "suggestions_school", label: "5) Suggestions to improve the admin tools", type: "text" },
    { id: "followUp_school", label: "6) Would you like support contact?", type: "boolean" },
    { id: "contactEmail_school", label: "If yes, email", type: "email" }
  ]
};

// Helper to build ordered question list (preserves frontend questionMeta or uses canonical)
function buildQuestionList(feedbackDoc) {
  // 1) If questionMeta exists and is an array, use it (preferred)
  if (Array.isArray(feedbackDoc.questionMeta) && feedbackDoc.questionMeta.length > 0) {
    return feedbackDoc.questionMeta.map(q => ({
      id: q.id,
      label: q.label || q.id,
      type: q.type || "text"
    }));
  }

  // 2) Fallback: use canonical set for the flow if available
  const flow = feedbackDoc.flow || "user";
  const canonical = canonicalQuestionSets[flow] || canonicalQuestionSets.user;

  const answers = feedbackDoc.answers || {};
  const included = new Set();

  // add canonical questions first (preserve canonical order)
  const result = canonical.map(q => {
    included.add(q.id);
    return { id: q.id, label: q.label, type: q.type || "text" };
  });

  // add any other keys from answers that weren't in canonical / questionMeta
  Object.keys(answers || {}).forEach(k => {
    if (!included.has(k)) {
      included.add(k);
      result.push({ id: k, label: k, type: "text" });
    }
  });

  return result;
}

function formatAnswer(v, type = "text") {
  if (v === null || v === undefined || v === "") return "—";
  
  switch(type) {
    case "boolean":
      if (typeof v === "boolean") return v ? "Yes" : "No";
      if (String(v).toLowerCase() === "yes") return "Yes";
      if (String(v).toLowerCase() === "no") return "No";
      return String(v);
    case "rating":
      const num = Number(v);
      if (isNaN(num)) return String(v);
      return `${v}/5`;
    case "nps":
      const npsNum = Number(v);
      if (isNaN(npsNum)) return String(v);
      return `${v}/10`;
    case "email":
      return String(v).toLowerCase();
    default:
      if (typeof v === "boolean") return v ? "Yes" : "No";
      if (Array.isArray(v)) return v.join(", ");
      return String(v);
  }
}

function getNpsCategory(score) {
  const num = Number(score);
  if (isNaN(num)) return "Unknown";
  if (num >= 9) return "Promoter";
  if (num >= 7) return "Passive";
  return "Detractor";
}

function getNpsColor(score) {
  const num = Number(score);
  if (isNaN(num)) return "#6b7280";
  if (num >= 9) return "#10b981"; // Green
  if (num >= 7) return "#f59e0b"; // Yellow
  return "#ef4444"; // Red
}

function getStatusColor(status) {
  const colors = {
    'new': '#3b82f6',      // Blue
    'in_review': '#f59e0b', // Yellow
    'actioned': '#8b5cf6',  // Purple
    'resolved': '#10b981'   // Green
  };
  return colors[status] || '#6b7280'; // Gray for unknown
}

function drawRatingStars(doc, rating, x, y, size = 12) {
  const starCount = 5;
  const starSpacing = 4;
  const starWidth = size;
  
  for (let i = 0; i < starCount; i++) {
    if (i < rating) {
      // Filled star
      doc.fillColor("#fbbf24");
    } else {
      // Empty star
      doc.fillColor("#d1d5db");
    }
    doc.text("★", x + (i * (starWidth + starSpacing)), y);
  }
}

// Create feedback (always snapshot userName and userEmail)
router.post("/", async (req, res) => {
  try {
    const payload = req.body || {};

    // Accept either userId directly OR a user snapshot object (user)
    // Also accept explicit userName/userEmail snapshots
    const {
      userId: userIdFromPayload,
      user: userSnapshot = null,
      userName: userNameSnapshot,
      userEmail: userEmailSnapshot,
      flow = "user",
      answers = {},
    } = payload;

    // Resolve a canonical userId if possible (payload.userId OR payload.user._id / id)
    const resolvedUserId =
      userIdFromPayload ||
      (userSnapshot && (userSnapshot._id || userSnapshot.id || userSnapshot.userId)) ||
      null;

    // Duplicate protection (optional) — use resolvedUserId if present
    if (resolvedUserId) {
      const exists = await Feedback.findOne({ userId: resolvedUserId, flow }).lean();
      if (exists) {
        return res.status(409).json({
          ok: false,
          message: "already_submitted",
          id: exists._id,
        });
      }
    }

    // Build base fbData
    const fbData = {
      flow,
      userId: resolvedUserId || null,
      sessionId: payload.sessionId || null,
      triggeredBy: payload.triggeredBy || "manual",
      page: payload.page || (payload.meta && payload.meta.path) || "",
      answers,
      // store questionMeta snapshot from frontend if present (helps PDF/rendering)
      questionMeta: Array.isArray(payload.questionMeta) ? payload.questionMeta : undefined,
      meta: {
        userAgent: (payload.meta && payload.meta.userAgent) || req.headers["user-agent"] || "",
        path: (payload.meta && payload.meta.path) || payload.page || "",
        device: (payload.meta && payload.meta.device) || "",
        platform: (payload.meta && payload.meta.platform) || "",
        ip: (payload.meta && payload.meta.ip) || req.ip,
      },
    };

    // 1) Frontend-provided explicit snapshots always win
    if (userNameSnapshot) fbData.userName = userNameSnapshot;
    if (userEmailSnapshot) fbData.userEmail = userEmailSnapshot;

    // 2) If frontend sent a user snapshot object, extract likely fields
    if (userSnapshot) {
      fbData.userName =
        fbData.userName ||
        userSnapshot.name ||
        userSnapshot.schoolName ||
        userSnapshot.displayName ||
        userSnapshot.fullName ||
        null;

      fbData.userEmail =
        fbData.userEmail ||
        userSnapshot.email ||
        userSnapshot.schoolEmail ||
        userSnapshot.contactEmail ||
        null;

      // also ensure we save userId if not already set
      if (!fbData.userId) {
        fbData.userId = userSnapshot._id || userSnapshot.id || null;
      }
    }

    // 3) If we still lack userName / userEmail but we do have a resolved userId,
    //    try to resolve account from DB in priority order: User -> Partner -> SchoolAdmin
    if (fbData.userId && (!fbData.userName || !fbData.userEmail)) {
      try {
        let account = null;

        // Try User collection
        try {
          account = await User.findById(fbData.userId).select("name email").lean();
        } catch (e) {
          account = null;
        }

        // Try Partner if not found
        if (!account) {
          try {
            account = await Partner.findById(fbData.userId).select("name email").lean();
          } catch (e) {
            account = null;
          }
        }

        // Try SchoolAdmin if not found
        if (!account) {
          try {
            account = await SchoolAdmin.findById(fbData.userId).select("schoolName name email").lean();
          } catch (e) {
            account = null;
          }
        }

        if (account) {
          fbData.userName = fbData.userName || account.name || account.schoolName || null;
          fbData.userEmail = fbData.userEmail || account.email || null;
        }
      } catch (err) {
        console.warn("Account lookup failed for feedback:", err && err.message ? err.message : err);
      }
    }

    // 4) If still no userId (anonymous) — but user provided contact info in answers, use it
    if (!fbData.userId) {
      const wantsFollowUp =
        (answers.followUp && String(answers.followUp).toLowerCase() === "yes") ||
        (answers.followUp_school && String(answers.followUp_school).toLowerCase() === "yes") ||
        (answers.followUp_partner && String(answers.followUp_partner).toLowerCase() === "yes");

      if (wantsFollowUp) {
        fbData.userEmail =
          fbData.userEmail ||
          answers.contactEmail ||
          answers.contactEmail_school ||
          answers.contactEmail_partner ||
          payload.userEmail ||
          null;
      }

      fbData.userName = fbData.userName || answers.contactName || payload.userName || null;
    }

    // Save feedback
    const fb = new Feedback(fbData);
    await fb.save();
    return res.status(201).json({ ok: true, id: fb._id });
  } catch (err) {
    console.error("POST /api/feedback error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});



router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(200, parseInt(req.query.limit || "20", 10));
    const skip = (page - 1) * limit;

    const { flow, status, from, to, q } = req.query;
    const filter = {};

    if (flow && flow !== "all") filter.flow = flow;
    if (status && status !== "all") filter.status = status;

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) {
        // include whole day if user passed YYYY-MM-DD
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = toDate;
      }
    }

    // Text search (safe regex with escaping)
    if (q && String(q).trim().length > 0) {
      const escaped = String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(escaped, "i");
      filter.$or = [
        { userName: re },
        { userEmail: re },
        { "answers.issueDesc": re },
        { "answers.suggestions": re },
        { "answers.confusing": re },
        { "answers.contactEmail": re },
      ];
    }

    // Count total matching
    const total = await Feedback.countDocuments(filter);

    // Fetch page
    const items = await Feedback.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.json({ ok: true, items, total, page, limit });
  } catch (err) {
    console.error("GET /api/feedback error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// Neat two-column answers layout (drop-in replacement)
router.get("/:id/pdf", async (req, res) => {
  try {
    const { id } = req.params;
    const feedback = await Feedback.findById(id).lean();
    if (!feedback) return res.status(404).send("Feedback not found");

    const doc = new PDFDocument({
      margin: 40,
      size: "A4",
      info: {
        Title: `Feedback Report - ${feedback._id}`,
        Author: "Skillnaav Feedback System",
        Subject: `Feedback from ${feedback.flow || "user"} flow`,
        Creator: "Skillnaav"
      }
    });

    // Headers & pipe
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="feedback_${feedback._id}.pdf"`);
    doc.pipe(res);

    // Stream safety
    doc.on("error", (err) => {
      console.error("PDF stream error:", err);
      try { res.destroy(err); } catch (e) {}
    });
    res.on("close", () => {
      console.warn("Client disconnected during PDF generation.");
      try { doc.end(); } catch (e) {}
    });

    // Layout constants
    const M = doc.page.margins.left; // 40
    const PAGE_W = doc.page.width;
    const PAGE_H = doc.page.height;
    const SAFE_BOTTOM = 80; // reserve for footer
    const CONTENT_W = PAGE_W - 2 * M;

    // Two-column widths: left for question, right for answer
    const LEFT_W = Math.round(CONTENT_W * 0.58);
    const GAP = 16;
    const RIGHT_W = CONTENT_W - LEFT_W - GAP;
    const LEFT_X = M;
    const RIGHT_X = LEFT_X + LEFT_W + GAP;

    // helpers
    function measureHeight(text, width, fontSize = 11, lineGap = 2) {
      const prev = doc._fontSize;
      doc.fontSize(fontSize);
      const h = doc.heightOfString(String(text || ""), { width, lineGap });
      doc.fontSize(prev || 11);
      return h;
    }

    function ensureSpace(heightNeeded) {
      const remaining = PAGE_H - SAFE_BOTTOM - doc.y;
      if (heightNeeded > remaining) {
        // draw footer on the page before adding a new page (absolute footer)
        const footerY = PAGE_H - 40;
        doc.save();
        doc.strokeColor("#e5e7eb").lineWidth(0.5);
        doc.moveTo(M, footerY - 10).lineTo(PAGE_W - M, footerY - 10).stroke();
        doc.restore();
        doc.addPage();
        // start new page with a small top margin
        doc.moveDown(1);
      }
    }

    // Header (same style)
    doc.fontSize(20).font("Helvetica-Bold").fillColor("#111827");
    const title = "Skillnaav — Feedback";
    doc.text(title, { align: "center" });
    const titleW = doc.widthOfString(title);
    const titleX = (PAGE_W - titleW) / 2;
    doc.moveTo(titleX, doc.y + 6).lineTo(titleX + titleW, doc.y + 6).strokeColor("#3b82f6").lineWidth(2).stroke();
    doc.moveDown(0.6);

    // Metadata block (left: basic, right: small user box)
    doc.fontSize(10).font("Helvetica").fillColor("#6b7280");
    doc.text(`ID: ${feedback._id}`, LEFT_X);
    doc.text(`Flow: ${feedback.flow || "user"}`, LEFT_X);
    doc.text(`Page: ${feedback.page || "—"}`, LEFT_X);
    doc.text(`Submitted: ${formatDate(feedback.createdAt || feedback.timestamp, "PPPpp")}`, LEFT_X);

    // right user box
    const startY = doc.y - 28; // align roughly with first metadata lines
    const status = feedback.status || "new";
    const statusColor = getStatusColor(status);
    doc.circle(RIGHT_X, startY + 8, 5).fill(statusColor);
    doc.fontSize(10).font("Helvetica-Bold").fillColor(statusColor);
    doc.text(String(status).toUpperCase(), RIGHT_X + 12, startY - 2);

    const boxTop = startY + 20;
    doc.save();
    doc.roundedRect(RIGHT_X, boxTop, RIGHT_W, 56, 6).fill("#f8fafc").stroke("#e2e8f0");
    doc.restore();

    const userName = feedback.userName || (feedback.answers && feedback.answers.contactName) || "—";
    const userEmail = feedback.userEmail || (feedback.answers && (feedback.answers.contactEmail || feedback.answers.contactEmail_partner)) || "—";

    doc.fontSize(10).font("Helvetica-Bold").fillColor("#111827");
    doc.text("User Information", RIGHT_X + 8, boxTop + 6);
    doc.fontSize(9).font("Helvetica").fillColor("#374151");
    doc.text(userName, RIGHT_X + 8, boxTop + 22, { width: RIGHT_W - 16, ellipsis: true });
    doc.text(userEmail, RIGHT_X + 8, boxTop + 36, { width: RIGHT_W - 16, ellipsis: true });

    // move cursor below metadata
    const bottomMeta = Math.max(doc.y, boxTop + 56);
    doc.y = bottomMeta + 14;

    // divider
    doc.moveTo(M, doc.y).lineTo(PAGE_W - M, doc.y).strokeColor("#e5e7eb").lineWidth(1).stroke();
    doc.moveDown(1);

    // Answers title
    doc.fontSize(16).font("Helvetica-Bold").fillColor("#111827");
    doc.text("Answers:");
    doc.moveDown(0.6);

    // Get ordered questions & answers
    const orderedQuestions = buildQuestionList(feedback);
    const answers = feedback.answers || {};

    // For each QA, measure height of Q and A in their column widths, ensure space, then render aligned
    for (const q of orderedQuestions) {
      const raw = answers[q.id];
      const formatted = formatAnswer(raw, q.type);
      if (!formatted || formatted === "—") continue;

      // measure heights
      const qH = measureHeight(q.label, LEFT_W - 8, 11, 2); // question font
      // for answer, allow larger width and smaller font
      const aH = (q.type === "rating" || q.type === "nps" || q.type === "boolean")
        ? measureHeight(formatted, RIGHT_W - 8, 11, 2)
        : measureHeight(formatted, RIGHT_W - 8, 10, 2);

      const blockHeight = Math.max(qH, aH) + 10;

      // ensure page has room; if not, new page
      ensureSpace(blockHeight);

      // render question at LEFT_X
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#1e293b");
      doc.text(q.label, LEFT_X, doc.y, { width: LEFT_W - 8, lineGap: 3 });

      // render answer at RIGHT_X (aligned with question top)
      const answerY = doc.y - qH + Math.max(0, (qH - aH)); // align top of answer with top of question area
      // But simpler: always render at current doc.y for top alignment — consistent visual result
      doc.fontSize((q.type === "rating" || q.type === "nps" || q.type === "boolean") ? 11 : 10).font("Helvetica").fillColor("#374151");
      // special types
      if (q.type === "rating" && raw) {
        const rating = parseInt(raw, 10);
        if (!isNaN(rating)) {
          doc.text(`${rating}/5`, RIGHT_X, doc.y, { width: RIGHT_W - 8 });
          // draw stars just after numeric
          drawRatingStars(doc, rating, RIGHT_X + 50, doc.y, 9);
        } else {
          doc.text(formatted, RIGHT_X, doc.y, { width: RIGHT_W - 8 });
        }
      } else if (q.type === "nps" && raw) {
        const nps = parseInt(raw, 10);
        if (!isNaN(nps)) {
          const npsColor = getNpsColor(nps);
          doc.font("Helvetica-Bold").fontSize(11).fillColor(npsColor);
          doc.text(`${nps}/10 (${getNpsCategory(nps)})`, RIGHT_X, doc.y, { width: RIGHT_W - 8 });
          doc.font("Helvetica").fillColor("#374151");
        } else {
          doc.text(formatted, RIGHT_X, doc.y, { width: RIGHT_W - 8 });
        }
      } else if (q.type === "boolean" && raw) {
        const isYes = String(raw).toLowerCase() === "yes" || raw === true;
        doc.font("Helvetica-Bold").fontSize(11).fillColor(isYes ? "#10b981" : "#ef4444");
        doc.text(formatted, RIGHT_X, doc.y, { width: RIGHT_W - 8 });
        doc.font("Helvetica").fillColor("#374151");
      } else {
        // default text answers (wrap in RIGHT_W)
        doc.text(formatted, RIGHT_X, doc.y, { width: RIGHT_W - 8, lineGap: 3 });
      }

      // After rendering both columns, advance doc.y to the lower of the two rendered blocks
      const qRenderedH = measureHeight(q.label, LEFT_W - 8, 11, 3);
      const aRenderedH = (q.type === "rating" || q.type === "nps" || q.type === "boolean")
        ? measureHeight(formatted, RIGHT_W - 8, 11, 3)
        : measureHeight(formatted, RIGHT_W - 8, 10, 3);
      const advanceBy = Math.max(qRenderedH, aRenderedH) + 10;
      doc.y = doc.y + advanceBy - qRenderedH; // ensure we move below both blocks

      // small divider line under each QA row (subtle)
      doc.moveTo(LEFT_X, doc.y - 6).lineTo(PAGE_W - M, doc.y - 6).strokeColor("#f3f4f6").lineWidth(0.4).stroke();
      doc.moveDown(0.3);
    }

    // Internal notes (unchanged)
    if (feedback.note) {
      if (doc.y > PAGE_H - SAFE_BOTTOM - 120) doc.addPage();
      doc.moveDown(0.6);
      doc.moveTo(M, doc.y).lineTo(PAGE_W - M, doc.y).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
      doc.moveDown(0.6);

      doc.fontSize(12).font("Helvetica-Bold").fillColor("#111827");
      doc.text("Internal Notes:");
      doc.moveDown(0.4);

      doc.fontSize(10).font("Helvetica").fillColor("#92400e");
      doc.text(String(feedback.note), { lineGap: 3 });
      doc.moveDown(1.2);
    }

    // Footer (absolute-ish)
    const footerY = PAGE_H - 40;
    doc.save();
    doc.fontSize(9).font("Helvetica").fillColor("#9ca3af");
    doc.text(`Generated: ${formatDate(new Date(), "PPpp")}`, M, footerY, { lineBreak: false });
    const notice = "Confidential - For internal use only";
    const noticeW = doc.widthOfString(notice);
    doc.text(notice, PAGE_W - M - noticeW, footerY, { lineBreak: false });
    doc.restore();

    doc.end();
  } catch (err) {
    console.error("PDF generation error:", err);
    if (!res.headersSent) res.status(500).send("Failed to generate PDF. Please try again.");
  }
});


// --- Add: check if a user already submitted ---
router.get("/check", async (req, res) => {
  try {
    const { userId, flow = "user" } = req.query;
    if (!userId) return res.json({ alreadySubmitted: false });

    const existing = await Feedback.findOne({ userId, flow }).lean();
    if (existing) return res.json({ alreadySubmitted: true, id: existing._id });

    return res.json({ alreadySubmitted: false });
  } catch (err) {
    console.error("GET /api/feedback/check error:", err);
    return res.status(500).json({ alreadySubmitted: false });
  }
});

// --- Add: patch feedback ---
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};
    if (req.body.status) updates.status = req.body.status;
    if (req.body.note !== undefined) updates.note = req.body.note;
    if (req.body.docPath !== undefined) updates.docPath = req.body.docPath;

    updates.updatedAt = new Date();

    const updated = await Feedback.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean();
    if (!updated) return res.status(404).json({ ok: false, message: "not_found" });

    return res.json({ ok: true, item: updated });
  } catch (err) {
    console.error("PATCH /api/feedback/:id error:", err);
    return res.status(500).json({ ok: false, message: "server_error" });
  }
});

// --- Export CSV ---
const { Parser } = require("json2csv");
router.get("/export", async (req, res) => {
  try {
    const { flow, from, to } = req.query;
    const filter = {};
    if (flow && flow !== "all") filter.flow = flow;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23,59,59,999);
        filter.createdAt.$lte = toDate;
      }
    }

    const items = await Feedback.find(filter).sort({ createdAt: -1 }).lean();

    const rows = items.map(it => ({
      id: String(it._id),
      flow: it.flow,
      userName: it.userName || "",
      userEmail: it.userEmail || (it.answers && it.answers.contactEmail) || "",
      page: it.page || "",
      createdAt: it.createdAt ? new Date(it.createdAt).toISOString() : "",
      status: it.status || "new",
      notes: it.note || "",
      answers: it.answers ? JSON.stringify(it.answers) : ""
    }));

    const json2csv = new Parser({ fields: Object.keys(rows[0] || {}) });
    const csv = json2csv.parse(rows);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=feedback_export_${flow || "all"}_${Date.now()}.csv`);
    return res.send(csv);
  } catch (err) {
    console.error("GET /api/feedback/export error:", err);
    return res.status(500).json({ ok: false, message: "export_failed" });
  }
});

module.exports = router;