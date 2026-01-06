// // backend/routes/feedbackPdf.js
// const express = require("express");
// const router = express.Router();
// const Feedback = require("../../models/webapp-models/Feedback");
// const PDFDocument = require("pdfkit");

// // Canonical question sets (fallback)
// const canonicalQuestionSets = {
//   user: [
//     { id: "overall", label: "1) Overall, how would you rate your experience today?" },
//     { id: "findEase", label: "2) How easy was it to find relevant internships/jobs? (1-5)" },
//     { id: "issueEncountered", label: "3) Did you face any issues while applying or saving a job?" },
//     { id: "issueDesc", label: "If yes, briefly describe" },
//     { id: "descriptionClarity", label: "4) How clear was the job description (1-5)?" },
//     { id: "performance", label: "5) How responsive/fast did the site feel (1-5)?" },
//     { id: "featureUsed", label: "6) Feature used most today" },
//     { id: "confusing", label: "7) Anything confusing or broken? (short)" },
//     { id: "nps", label: "8) How likely are you to recommend Skillnaav? (0-10)" },
//     { id: "suggestions", label: "9) Suggestions to improve internship discovery" },
//     { id: "followUp", label: "10) Would you like follow-up from Skillnaav?" },
//     { id: "contactEmail", label: "If yes, email:" }
//   ],
//   partner: [
//     { id: "overall_partner", label: "1) Overall partner dashboard experience" },
//     { id: "postEase", label: "2) How easy was it to post an internship/job?" },
//     { id: "approvalClarity", label: "3) How clear was the approval/status process?" },
//     { id: "toolsUsed", label: "4) Which tool did you use most?" },
//     { id: "issues_partner", label: "5) Did you face any issues while posting?" },
//     { id: "issueDesc_partner", label: "If yes, describe" },
//     { id: "timeToPost", label: "6) Approx time taken to post (minutes)" },
//     { id: "improvements_partner", label: "7) What would improve partner experience?" },
//     { id: "followUp_partner", label: "8) Want a partner manager follow-up?" },
//     { id: "contactEmail_partner", label: "If yes, email" }
//   ],
//   schoolAdmin: [
//     { id: "overall_school", label: "1) Overall, how was the school admin experience?" },
//     { id: "reviewFlow", label: "2) How easy is it to review partner postings?" },
//     { id: "tools_school", label: "3) Which action did you perform?" },
//     { id: "issue_school", label: "4) Did you face issues with the moderation tools?" },
//     { id: "issueDesc_school", label: "If yes, describe" },
//     { id: "suggestions_school", label: "5) Suggestions to improve the admin tools" },
//     { id: "followUp_school", label: "6) Would you like support contact?" },
//     { id: "contactEmail_school", label: "If yes, email" }
//   ]
// };

// function getOrderedQuestions(f) {
//   if (Array.isArray(f.questionMeta) && f.questionMeta.length > 0) {
//     return f.questionMeta.map(q => ({ id: q.id, label: q.label || q.id }));
//   }
//   return canonicalQuestionSets[f.flow] || canonicalQuestionSets.user;
// }

// function formatAnswer(v) {
//   if (v === null || v === undefined || v === "") return "—";
//   if (typeof v === "boolean") return v ? "Yes" : "No";
//   if (Array.isArray(v)) return v.join(", ");
//   if (typeof v === "object") {
//     try {
//       return JSON.stringify(v, null, 2);
//     } catch {
//       return String(v);
//     }
//   }
//   return String(v);
// }

// // Helper to draw a horizontal rule
// function hr(doc, yOffset = 6) {
//   const curY = doc.y + yOffset;
//   const startX = doc.page.margins.left;
//   const endX = doc.page.width - doc.page.margins.right;
//   doc.save();
//   doc.moveTo(startX, curY).lineTo(endX, curY).strokeColor("#e6e6e6").lineWidth(0.6).stroke();
//   doc.restore();
//   doc.moveDown(1);
// }

// router.get("/:id/pdf", async (req, res) => {
//   try {
//     const { id } = req.params;
//     const f = await Feedback.findById(id).lean();
//     if (!f) return res.status(404).send("Not found");

//     // Response headers
//     res.setHeader("Content-Type", "application/pdf");
//     res.setHeader("Content-Disposition", `attachment; filename=feedback_${id}.pdf`);

//     const doc = new PDFDocument({
//       margin: 48,
//       size: "A4",
//       info: {
//         Title: `Feedback ${id}`,
//         Author: "Skillnaav",
//       }
//     });
//     doc.pipe(res);

//     // HEADER (title + small meta)
//     doc.fontSize(18).font("Helvetica-Bold").fillColor("#111827").text("Skillnaav — Feedback Report", { align: "left" });
//     doc.moveDown(0.3);

//     // small subtitle row
//     doc.fontSize(10).font("Helvetica").fillColor("#374151");
//     doc.text(`ID: ${String(f._id)}`, { continued: true });
//     doc.text("   |   ", { continued: true });
//     doc.text(`Flow: ${f.flow}`, { continued: true });
//     doc.text("   |   ", { continued: true });
//     doc.text(`Submitted: ${new Date(f.createdAt || f.timestamp).toLocaleString()}`);
//     doc.moveDown(0.6);

//     // basic user row
//     doc.fontSize(11).font("Helvetica-Bold").fillColor("#111827").text("User:");
//     doc.fontSize(11).font("Helvetica").fillColor("#111827");
//     doc.text(`  Name: ${f.userName || "—"}`);
//     doc.text(`  Email: ${f.userEmail || (f.answers && f.answers.contactEmail) || "—"}`);
//     doc.moveDown(0.6);

//     // Page / triggeredBy
//     doc.fontSize(11).font("Helvetica-Bold").fillColor("#111827").text("Context:");
//     doc.fontSize(11).font("Helvetica").fillColor("#111827");
//     doc.text(`  Page: ${f.page || "—"}`);
//     doc.text(`  Triggered by: ${f.triggeredBy || "—"}`);
//     doc.text(`  Status: ${f.status || "new"}`);
//     doc.moveDown(0.6);

//     hr(doc, 6);

//     // RESPONSES SECTION
//     doc.fontSize(13).font("Helvetica-Bold").fillColor("#111827").text("Responses:");
//     doc.moveDown(0.3);

//     const ordered = getOrderedQuestions(f);
//     const answers = f.answers || {};
//     const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

//     ordered.forEach(q => {
//       // page break if near bottom
//       if (doc.y > doc.page.height - doc.page.margins.bottom - 120) doc.addPage();

//       const label = q.label || q.id;
//       const rawVal = Object.prototype.hasOwnProperty.call(answers, q.id) ? answers[q.id] : "";
//       let valStr = formatAnswer(rawVal);

//       // If the value is multi-line JSON, preserve line breaks with text
//       // print the label
//       doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f172a").text(label, { width: contentWidth });
//       doc.moveDown(0.05);

//       // print the answer: if it contains newline, print with .text to wrap properly
//       doc.fontSize(11).font("Helvetica").fillColor("#111827");
//       if (valStr.includes("\n")) {
//         // for preformatted block, indent a bit
//         const lines = String(valStr).split("\n");
//         lines.forEach(line => {
//           doc.text(`  ${line}`, { width: contentWidth - 16, indent: 8 });
//         });
//       } else {
//         doc.text(`  ${valStr}`, { width: contentWidth - 16, indent: 8 });
//       }

//       doc.moveDown(0.4);
//     });

//     hr(doc, 6);

//     // TECHNICAL META (smaller font)
//     doc.fontSize(10).font("Helvetica-Bold").fillColor("#111827").text("Technical meta:");
//     doc.moveDown(0.2);
//     doc.fontSize(9).font("Helvetica").fillColor("#374151")
//       .text(`User Agent: ${f.meta?.userAgent || "—"}`, { width: contentWidth }).moveDown(0.3);

//     if (f.meta?.ip) {
//       doc.fontSize(9).font("Helvetica").fillColor("#374151").text(`IP: ${f.meta.ip}`);
//     }

//     // Internal note if any
//     if (f.note) {
//       doc.moveDown(0.6);
//       if (doc.y > doc.page.height - doc.page.margins.bottom - 120) doc.addPage();
//       doc.fontSize(11).font("Helvetica-Bold").fillColor("#111827").text("Internal note:");
//       doc.fontSize(11).font("Helvetica").fillColor("#111827")
//         .text(f.note, { width: contentWidth, indent: 8, lineGap: 2 });
//     }

//     // finalize
//     doc.end();
//   } catch (err) {
//     console.error("PDF error", err);
//     res.status(500).send("Server error");
//   }
// });

// module.exports = router;
