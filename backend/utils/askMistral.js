require("dotenv").config();
const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require("@aws-sdk/client-bedrock-runtime");

const Partner = require("../models/webapp-models/partnerModel");

const client = new BedrockRuntimeClient({
  region: process.env.AWS_CHAT_REGION,
  credentials: {
    accessKeyId: process.env.AWS_CHAT_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_CHAT_SECRET_ACCESS_KEY,
  },
  maxAttempts: 3,
});

const OFF_SCOPE_REPLY = "Sorry, I can't assist you with that. I can only assist you with this dashboard.";

async function askMistral(userPrompt, partnerId, featureIndex = [], opts = {}) {
  let partnerContext = "";
  let partnerName = "";

  try {
    if (partnerId) {
      const partner = await Partner.findById(partnerId).lean();
      if (partner) {
        partnerName = partner.name || "";
        partnerContext = `
PARTNER NAME: ${partner.name}
PARTNER EMAIL: ${partner.email}
APPROVAL STATUS: ${partner.adminApproved ? "Approved" : "Not Approved"}

FLOW CONTEXT:
- As a new partner, you must complete your profile.
- Then you can post internships and monitor applications.
- You can only access dashboard features after admin approval.
`;
      }
    }
  } catch (err) {
    console.warn("Could not fetch partner context", err);
  }

  // --- Sidebar-driven scope (auto-updates when the frontend passes featureIndex) ---
  const defaultIndex = [
    { key: "home", label: "Dashboard", description: "Overview cards, quick stats, and recent activity." },
    { key: "user-management", label: "User Management", description: "Manage students, partners, and access roles." },
    { key: "school-accounts", label: "School Admin Accounts", description: "Create/approve school admin accounts." },
    { key: "analytics", label: "Analytics", description: "Charts and KPIs for internships and applications." },
    { key: "settings", label: "Settings", description: "Profile, org details, preferences." },
    { key: "bin", label: "Bin", description: "Restore or permanently delete removed items." },
    { key: "partner-accounts", label: "Partner Accounts", description: "Create and manage partner organizations." },
    { key: "internship-posts", label: "Internship Posts", description: "Create, edit, publish, or close internship postings." },
    { key: "applications", label: "Applications", description: "Review and manage applicants: View Applications, Shortlist, Shortlisted Resumes." },
    { key: "instructor-management", label: "Instructor Management", description: "Create, view, edit, and delete instructors. New instructor creation requires Email OTP verification and Resume upload; Photo/Certificates optional. Manage availability (days/time) and preferable time slots." },
    { key: "offer-templates", label: "Offer Templates", description: "Create and manage Offer Letter templates; upload a background image and reuse when sending offers." },
    { key: "stipend-details", label: "Stipend Details", description: "See stipend information like 'Student Pays' amounts and currency across internships." },
    { key: "profile", label: "Profile", description: "Update organization & personal details, change password, and profile photo." },
    { key: "support", label: "Support", description: "Contact support; fill the form with your issue and (optionally) add an attachment." },
    { key: "logout", label: "Logout", description: "Securely sign out from the Partner dashboard." },
    { key: "internship-payments", label: "Internship Payments", description: "Track/verify student payments for internships." },
    { key: "partner-payments", label: "Partner Payments", description: "Billing and payments between Skillnaav and partners." },
  ];

  // If the frontend didn’t pass featureIndex yet, fall back to defaults
  const index = Array.isArray(featureIndex) && featureIndex.length ? featureIndex : defaultIndex;

  // For system prompt bullets
  const featuresBullet = index.map(it => `- ${it.label} (${it.key}): ${it.description}`).join("\n");

  // Build a small set of allowed, in-scope keywords (labels, keys, and a few synonyms)
  const allowedKeywords = new Set(
    index.flatMap(it => {
      const labelLow = String(it.label || "").toLowerCase();
      const bits = [
        it.key,
        it.label,
        ...(labelLow ? labelLow.split(/\s+/) : []),
      ];

      // Payments
      if (it.key.includes("payments")) bits.push("payment", "payments", "billing", "invoice", "invoices");

      // Internship posts
      if (it.key.includes("internship")) bits.push("internship", "internships", "post", "posting", "posts");

      // Analytics
      if (it.key.includes("analytics")) bits.push("chart", "charts", "kpi", "insights", "analytics");

      // Applications
      if (it.key.includes("application") || labelLow.includes("application")) {
        bits.push(
          "application", "applications",
          "applicant", "applicants",
          "candidate", "candidates",
          "view applications",
          "shortlist", "shortlisted", "shortlisted resumes"
        );
      }

      // Offer Templates (covers "Offer Letter Templates")
      if (it.key.includes("offer") || labelLow.includes("offer")) {
        if (it.key.includes("template") || labelLow.includes("template")) {
          bits.push(
            "offer template", "offer templates",
            "offer letter", "offer letters",
            "offer letter template", "offer letter templates",
            "upload template", "template upload",
            "background image", "template name"
          );
        }
      }

      // Instructor Management
      if (it.key.includes("instructor") || labelLow.includes("instructor")) {
        bits.push(
          "instructor", "instructors",
          "teacher", "teachers",
          "tutor", "tutors",
          "mentor", "mentors",
          "trainer", "trainers",

          "instructor management",
          "add instructor", "create instructor", "new instructor",
          "edit instructor", "update instructor",
          "view instructor", "instructor details",
          "delete instructor", "remove instructor",

          // OTP flow
          "otp", "email otp", "verify email", "send otp", "verify otp",

          // Availability + slots
          "availability", "available days", "available start", "available end",
          "time slot", "time slots", "preferable slots", "preferable time slots",

          // Documents
          "resume", "profile photo", "photo", "certificates",

          // Assignment
          "assigned internship", "assign internship", "notes"
        );
      }

      // Stipend Details
      if (it.key.includes("stipend") || labelLow.includes("stipend")) {
        bits.push(
          "stipend", "stipends", "stipend details", "stipend internships",
          "student pays", "amount", "currency", "paid", "unpaid"
        );
      }

      // Profile
      if (it.key.includes("profile") || labelLow.includes("profile")) {
        bits.push(
          "profile", "edit profile", "update profile", "save profile",
          "name", "email", "password", "change password",
          "photo", "avatar", "organization", "org details"
        );
      }

      // Support
      if (it.key.includes("support") || labelLow.includes("support")) {
        bits.push(
          "support", "help", "contact", "write to us",
          "issue", "ticket", "submit", "attachment",
          "describe your issue", "support form", "email address"
        );
      }

      // Logout
      if (it.key.includes("logout") || labelLow.includes("logout")) {
        bits.push("logout", "log out", "sign out", "signout", "exit");
      }

      return bits;
    }).map(s => String(s).toLowerCase())
  );

  // Allow general platform terms
  ["skillnaav", "platform", "dashboard"].forEach(k => allowedKeywords.add(k));

  // QUICK pre-check to refuse general/off-scope questions BEFORE calling the model
  const msgLow = (userPrompt || "").toLowerCase();
  const inScope = [...allowedKeywords].some(k => msgLow.includes(k));

  // Greeting handler
  if (/\b(hi|hello|hey|namaste)\b/i.test(msgLow)) {
    const quick = index.map(it => `• ${it.label}`).join("\n");
    const firstName = (partnerName || "").trim().split(/\s+/)[0] || "";
    const hello = firstName ? `Hi ${firstName}!` : "Hi!";
    return `${hello} I’m your Skillnaav Partner Assistant. I can help you to assist with this Partner dashboard.\n\nHere are some sections you can ask me about:\n${quick}`;
  }

  // Platform intro handler
  if (/(what\s+is\s+(skillnaav|this\s+platform)|about\s+(skillnaav|the\s+platform))/i.test(msgLow)) {
    return `Our Vision:
\nAligning with the Canadian Vision Priorities, Skillnaav's mission is to empower Canadians with early opportunities, diverse career paths, and access to quality internships while supporting lifelong learning and skills development.

What Skillnaav is about:
\n
• Early exposure: enable students to explore career paths from a young age and make informed choices.
\n
• Quality internships: provide access to high-quality, real-world internships across industries (including aerospace).
\n
• Diverse pathways: encourage exploration across a wide range of professions with guidance and resources.
\n
• Lifelong learning: support continuous upskilling throughout the career journey.
\n
• Aerospace focus: offer specialized programs and internships that foster innovation and exploration.

If you want help using the Partner dashboard, ask about a specific tab, e.g., "What is Applications?", "How do I create an Offer Template?", or "Where can I see Stipend Details?"`;
  }

  if (!inScope) {
    return OFF_SCOPE_REPLY;
  }

  const INSTRUCTOR_MANAGEMENT_GUIDE = `
INSTRUCTOR MANAGEMENT (How it works in this dashboard):
- List & search: The Instructor Management page shows instructors and supports searching (name/email/phone/skills etc.).
- Add a new instructor (creation workflow):
  1) Email OTP verification is REQUIRED before saving a NEW instructor.
     - Send OTP to the instructor email, enter OTP, verify.
     - If OTP is not verified, creation is blocked.
  2) Resume upload is REQUIRED for new instructor creation.
     - Photo is optional.
     - Certificates are optional (multiple).
  3) Availability:
     - Select available days.
     - Set Start Time and End Time (End must be after Start).
     - Preferable time slots can be added in 24-hour format (HH:MM).
  4) Save:
     - The instructor is saved under the current partner scope (partnerId).
     - Same email cannot be used twice for the same partner (unique per partner).
     - After creation, notification emails may be sent (non-blocking).

- View details:
  - "Instructor Details" modal shows sections: Personal & Contact, Professional & Teaching, Availability, Compensation, Compliance & Documents, Assignment.
  - Resume/Photo/Certificates open via links (stored as URLs).

- Edit instructor:
  - You can update fields and optionally replace Resume/Photo/Certificates.
  - End Time must still be after Start Time.

- Delete instructor:
  - Deletion uses a two-step confirmation:
    1) "Are you sure?"
    2) "Confirm one last time" (final irreversible)
  - If deletion fails with 401, the session/token is missing or expired (re-login required).

- Optional auto-assignment (if enabled in your setup):
  - A backend service can auto-assign instructors to schedule sessions based on availability window and load balancing,
    writing instructor / instructorName into timetable sessions.
`.trim();

  const SYSTEM_PROMPT = `
<<SYS>>
You are "Skillnaav Partner Assistant" — a strict, on-platform guide for the Partner dashboard ONLY.

Rules:
- If the user asks anything outside the Partner dashboard, respond with exactly: Sorry, I can't assist you with that.
- Provide concise, step-by-step guidance using real UI labels and button names.
- If access is restricted (e.g., not approved), mention it briefly and suggest next steps.
- Never invent features or pricing. Never include external links.

Available Partner Dashboard sections (derived from the sidebar):
${featuresBullet}

${INSTRUCTOR_MANAGEMENT_GUIDE}

Partner context (for tone only; do not expose PII verbatim in answers):
${partnerContext}
<</SYS>>
`.trim();

  const cmd = new InvokeModelCommand({
    modelId: "mistral.mistral-large-2402-v1:0",
    contentType: "application/json",
    body: JSON.stringify({
      prompt: `<s>[INST] ${SYSTEM_PROMPT}\n${userPrompt} [/INST]`,
      max_tokens: opts.max_tokens ?? 1024,
      temperature: opts.temperature ?? 0.2,
      top_p: opts.top_p ?? 0.9,
      top_k: opts.top_k ?? 50,
    }),
  });

  const res = await client.send(cmd);
  const json = JSON.parse(await res.body.transformToString());

  const modelText = (
    json.outputs?.[0]?.text ||
    json.completion ||
    json.output ||
    ""
  ).trim();

  // Post-filter signals
  const textLow = modelText.toLowerCase();
  const mentionsAllowed = [...allowedKeywords].some(k => textLow.includes(k));
  const hasExternalLink = /https?:\/\//i.test(modelText);

  if (hasExternalLink || (!mentionsAllowed && !inScope)) {
    return OFF_SCOPE_REPLY;
  }

  return modelText;
}

module.exports = askMistral;