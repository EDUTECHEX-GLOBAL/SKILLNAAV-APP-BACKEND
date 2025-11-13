// backend/utils/instructorMailer.js
const notifyUser = require("./notifyUser");

// Optional public base URL to make file links absolute (ex: https://skillnaav.com)
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "";

/* ------------ helpers ------------ */

const absUrl = (url) => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${PUBLIC_BASE_URL}${url}`;
};

const yesNo = (v) => (v ? "Yes" : v === false ? "No" : "");

const join = (v) => (Array.isArray(v) ? v.filter(Boolean).join(", ") : v ?? "");

const money = (amt, cur) => {
  if (amt == null || amt === "") return "";
  return cur ? `${amt} ${cur}` : String(amt);
};

const td = (label, value) => {
  const val = value ?? "";
  if (val === "" || val === "undefined" || val === "null") return "";
  return `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;width:40%;">${label}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${val}</td>
    </tr>`;
};

const section = (title, rowsHtml) => {
  const rows = rowsHtml.trim();
  if (!rows) return "";
  return `
    <h3 style="margin:18px 0 8px;">${title}</h3>
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden;">
      <tbody>${rows}</tbody>
    </table>`;
};

const renderPreferableSlots = (slots) => {
  if (!Array.isArray(slots) || slots.length === 0) return "";
  const rows = slots
    .filter(Boolean)
    .map((s, i) => {
      const d = s?.day ?? "";
      const st = s?.start ?? "";
      const en = s?.end ?? "";
      if (!d && !st && !en) return "";
      return `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;">${i + 1}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;">${d || "-"}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;">${st || "-"}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;">${en || "-"}</td>
        </tr>`;
    })
    .filter(Boolean)
    .join("");

  if (!rows) return "";
  return `
    <h3 style="margin:18px 0 8px;">Your Preferable Slots</h3>
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#fafafa;">
          <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #eee;">#</th>
          <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #eee;">Day</th>
          <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #eee;">Start Time</th>
          <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #eee;">End Time</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
};

/**
 * Compose the instructor “created” email body with all filled details.
 */
function buildInstructorCreatedEmail(docRaw) {
  const doc = typeof docRaw?.toObject === "function" ? docRaw.toObject() : docRaw || {};

  // Destructure common/file/meta fields; keep the rest for safety if you add more later
  const {
    // personal & contact
    firstName,
    lastName,
    email,
    phone,
    altPhone,
    country,
    state,
    city,
    postalCode,
    address1,
    address2,

    // professional
    qualification,
    experienceYears,
    organization,
    specializations,
    skills,
    languages,
    teachingMode,
    bio,

    // availability
    availableDays,
    availableStart,
    availableEnd,
    preferableSlots,
    timezone,

    // compensation / payout
    rateType,
    expectedRate,
    currency,
    payoutMethod,
    payoutIdentifier,

    // agreements / flags
    backgroundCheck,
    ndaSigned,
    agreeToTerms,

    // assignment
    assignInternship,
    notes,

    // files
    resume,
    photo,
    certificates,

    // meta
    createdAt,
    updatedAt,

    __v,
    _id,

    // keep any future fields here
    ...rest
  } = doc;

  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Instructor";
  const subject = "SkillNaav — Your Instructor Profile Has Been Created";

  /* ------------ sections ------------ */

  const personal = section(
    "Personal & Contact",
    [
      td("Full Name", fullName),
      td("Email", email),
      td("Phone", phone),
      td("Alternate Phone", altPhone),
      td("Country", country),
      td("State/Province", state),
      td("City", city),
      td("Postal Code", postalCode),
      td("Address Line 1", address1),
      td("Address Line 2", address2),
    ].join("")
  );

  const professional = section(
    "Professional & Teaching",
    [
      td("Qualification", qualification),
      td("Experience (Years)", experienceYears != null ? String(experienceYears) : ""),
      td("Organization", organization),
      td("Specializations", join(specializations)),
      td("Skills", join(skills)),
      td("Languages", join(languages)),
      td("Teaching Mode", teachingMode),
      td("Bio", bio),
    ].join("")
  );

  const availability = [
    section(
      "Availability",
      [
        td("Available Days", join(availableDays)),
        td("Overall Window (24 Hours Format)", [availableStart, availableEnd].filter(Boolean).join(" - ")),
        td("Timezone", timezone),
      ].join("")
    ),
    // Preferable slots table (own block)
    renderPreferableSlots(preferableSlots),
  ]
    .filter(Boolean)
    .join("");

  const compensation = section(
    "Compensation & Payout",
    [
      td("Rate Type", rateType),
      td("Expected Rate", money(expectedRate, currency)),
      td("Currency", currency),
      td("Payout Method", payoutMethod),
      td("Payout Identifier", payoutIdentifier),
    ].join("")
  );

  const agreements = section(
    "Compliance & Agreements",
    [
      td("Background Check", backgroundCheck || ""),
      td("NDA Signed", yesNo(ndaSigned)),
      td("Agreed to Terms", yesNo(agreeToTerms)),
    ].join("")
  );

  const assignment = section(
    "Assignment / Notes",
    [td("Assigned Internship", assignInternship), td("Notes", notes)].join("")
  );

  // Files section
  const resumeLink = resume?.url
    ? `<li>Resume: <a href="${absUrl(resume.url)}" target="_blank" rel="noopener">View</a></li>`
    : "";
  const photoLink = photo?.url
    ? `<li>Photo: <a href="${absUrl(photo.url)}" target="_blank" rel="noopener">View</a></li>`
    : "";
  const certLinks =
    Array.isArray(certificates) && certificates.length
      ? `<li>Certificates:
           <ul style="margin:4px 0 0 18px;">
             ${certificates
        .map(
          (c, i) =>
            `<li><a href="${absUrl(c?.url)}" target="_blank" rel="noopener">Certificate ${i + 1}</a></li>`
        )
        .join("")}
           </ul>
         </li>`
      : "";
  const filesBlock =
    resumeLink || photoLink || certLinks
      ? `<ul style="margin:0; padding-left:18px;">${resumeLink}${photoLink}${certLinks}</ul>`
      : "<p>No files uploaded.</p>";

  // Any future/unknown fields still included as a generic table (nice safety net)
  const restRows = Object.entries(rest || {})
    .filter(([k, v]) => v != null && v !== "" && !String(k).startsWith("__"))
    .map(([k, v]) => td(k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()), Array.isArray(v) ? join(v) : String(v)))
    .join("");
  const restSection = restRows ? section("Additional Details", restRows) : "";

  // Remove Metadata section from the email
  const meta = "";

  const bodyHtml = `
    <p>Hi ${fullName},</p>
    <p>Welcome to <strong>SkillNaav</strong> 🎉 Your instructor profile has been created with the details below:</p>

    ${personal}
    ${professional}
    ${availability}
    ${compensation}
    ${agreements}
    ${assignment}

    <h3 style="margin:18px 0 8px;">Files</h3>
    ${filesBlock}

    ${restSection}
    ${meta}

    <p style="margin-top:16px;">If any of the above information needs correction, please co-ordinate with you partner.</p>
  `;

  return { subject, bodyHtml, to: email };
}

/** Public: send the email (safe to call; does not throw) */
async function sendInstructorCreatedEmail(doc) {
  const { to, subject, bodyHtml } = buildInstructorCreatedEmail(doc);
  if (!to) {
    console.warn("[instructorMailer] No email on instructor document; skipping mail.");
    return { ok: false, reason: "missing-email" };
  }
  return await notifyUser(to, subject, bodyHtml);
}

module.exports = {
  sendInstructorCreatedEmail,
  buildInstructorCreatedEmail, // exported for testing
};