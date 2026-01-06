// scripts/backfillFeedbackQuestionMeta.js
// Run: node scripts/backfillFeedbackQuestionMeta.js
require("dotenv").config();
const mongoose = require("mongoose");
const Feedback = require("./Feedback"); // adjust if needed

// === Canonical question sets (copied from your frontend) ===
const userFlowQuestionSet = [
  { id: "overall", type: "rating", label: "1) Overall, how would you rate your experience today?" },
  { id: "findEase", type: "scale", min: 1, max: 5, label: "2) How easy was it to find relevant internships/jobs? (1-5)" },
  { id: "issueEncountered", type: "yesno", label: "3) Did you face any issues while applying or saving a job?" },
  { id: "issueDesc", type: "textarea", label: "If yes, briefly describe" },
  { id: "descriptionClarity", type: "rating", label: "4) How clear was the job description (1-5)?" },
  { id: "performance", type: "rating", label: "5) How responsive/fast did the site feel (1-5)?" },
  { id: "featureUsed", type: "select", label: "6) Feature used most today", options: ["Search","Save","Apply","Profile","Other"] },
  { id: "confusing", type: "text", label: "7) Anything confusing or broken? (short)" },
  { id: "nps", type: "scale", min: 0, max: 10, label: "8) How likely are you to recommend Skillnaav? (0-10)" },
  { id: "suggestions", type: "textarea", label: "9) Suggestions to improve internship discovery" },
  { id: "followUp", type: "yesno", label: "10) Would you like follow-up from Skillnaav?" },
  { id: "contactEmail", type: "text", label: "If yes, email:" }
];

const partnerFlowQuestionSet = [
  { id: "overall_partner", type: "rating", label: "1) Overall, how would you rate your partner dashboard experience?" },
  { id: "postEase", type: "scale", label: "2) How easy was it to post an internship/job?" },
  { id: "approvalClarity", type: "rating", label: "3) How clear was the approval/status process?" },
  { id: "toolsUsed", type: "select", label: "4) Which tool did you use most?", options: ["Post Job","Edit Job","Analytics","Profile"] },
  { id: "issues_partner", type: "yesno", label: "5) Did you face any issues while posting?" },
  { id: "issueDesc_partner", type: "textarea", label: "If yes, describe" },
  { id: "timeToPost", type: "text", label: "6) Approx time taken to post (minutes)" },
  { id: "improvements_partner", type: "textarea", label: "7) What would improve partner experience?" },
  { id: "followUp_partner", type: "yesno", label: "8) Want a partner manager follow-up?" },
  { id: "contactEmail_partner", type: "text", label: "If yes, email" }
];

const schoolAdminFlowQuestionSet = [
  { id: "overall_school", type: "rating", label: "1) Overall, how was the school admin experience?" },
  { id: "reviewFlow", type: "rating", label: "2) How easy is it to review partner postings (1-5)?" },
  { id: "tools_school", type: "select", label: "3) Which action did you perform?", options: ["Approve","Reject","Edit","Communicate"] },
  { id: "issue_school", type: "yesno", label: "4) Did you face issues with the moderation tools?" },
  { id: "issueDesc_school", type: "textarea", label: "If yes, describe" },
  { id: "suggestions_school", type: "textarea", label: "5) Suggestions to improve the admin tools" },
  { id: "followUp_school", type: "yesno", label: "6) Would you like support contact?" },
  { id: "contactEmail_school", type: "text", label: "If yes, email" }
];

// Map flows -> canonical sets
const canonical = {
  user: userFlowQuestionSet,
  partner: partnerFlowQuestionSet,
  schoolAdmin: schoolAdminFlowQuestionSet
};

async function main() {
  const MONGO = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/skillnaav";
  await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });

  let totalUpdated = 0;

  for (const flow of Object.keys(canonical)) {
    // find docs missing questionMeta
    const cursor = Feedback.find({ flow, $or: [{ questionMeta: { $exists: false } }, { questionMeta: null }] }).cursor();

    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
      try {
        const answers = doc.answers || {};
        const flowSet = canonical[flow] || [];
        // keep only questions that have an answer to avoid many empties
        const filtered = flowSet.filter(q => Object.prototype.hasOwnProperty.call(answers, q.id) && answers[q.id] !== null && String(answers[q.id]).trim() !== "");
        const toSave = (filtered.length > 0) ? filtered : flowSet; // if none present, save full canonical

        await Feedback.updateOne({ _id: doc._id }, { $set: { questionMeta: toSave } });
        console.log(`Backfilled ${doc._id.toString()} (${flow}) with ${toSave.length} questionMeta`);
        totalUpdated++;
      } catch (err) {
        console.error("Failed updating", doc._id, err);
      }
    }
  }

  console.log("Backfill complete. totalUpdated:", totalUpdated);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
