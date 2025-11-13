// backend/utils/googleAuthMailer.js
const notifyUser = require("./notifyUser");

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "";
const SERVER_BASE_URL = (process.env.SERVER_BASE_URL || "").replace(/\/+$/, "");
const FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL || "").replace(/\/+$/, "");

// helper: safe absolute URL
function abs(url) {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    return `${PUBLIC_BASE_URL}${url}`;
}

/**
 * Email asking instructor to connect Google Calendar (OAuth)
 * @param {Object} options
 * @param {string} options.to  - instructor email (required)
 * @param {string} [options.firstName]
 * @param {string} [options.lastName]
 * @param {Object} [options.statePayload] - will be base64-encoded and sent to /api/google/auth?state=...
 */
async function sendGoogleAuthPromptEmail({ to, firstName, lastName, statePayload = {} }) {
    if (!to) return { ok: false, reason: "missing-email" };

    // Build state (base64 JSON). Include a minimal hint for your backend/analytics.
    const b64state = Buffer.from(
        JSON.stringify({ role: "instructor", email: to, ...statePayload })
    ).toString("base64");

    // Backend entry for OAuth
    const authUrl = `${SERVER_BASE_URL}/api/google/auth?state=${encodeURIComponent(b64state)}`;

    const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Instructor";
    const subject = "SkillNaav — Connect your Google Calendar";

    const bodyHtml = `
    <p>Hi ${fullName},</p>
    <p>To keep your internship schedule in sync automatically, please connect your Google Calendar to <strong>SkillNaav</strong>.</p>
    <p>
      <a href="${authUrl}" target="_blank" rel="noopener"
         style="display:inline-block;background:#0ea5a4;color:#fff;padding:10px 14px;border-radius:8px;
                text-decoration:none;font-weight:600;">
        Connect Google Calendar
      </a>
    </p>
    <p>If the button doesn't work, copy and paste this URL in your browser:</p>
    <p style="word-break:break-all;"><a href="${authUrl}" target="_blank" rel="noopener">${authUrl}</a></p>
    <hr/>
    <p>After you approve access, we’ll confirm by email and your events can be synced to your calendar.</p>
  `;

    return await notifyUser(to, subject, bodyHtml);
}

/**
 * Email confirming successful Google authentication
 */
async function sendGoogleAuthSuccessEmail({ to, firstName, lastName }) {
    if (!to) return { ok: false, reason: "missing-email" };

    const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Instructor";
    const subject = "Google authentication to SkillNaav successful ✅";

    const dashboardUrl = abs(`${FRONTEND_BASE_URL}/user-main-page?tab=offer-letter`);

    const bodyHtml = `
    <p>Hi ${fullName},</p>
    <p><strong>Success!</strong> Your Google Calendar is now connected to <strong>SkillNaav</strong>.</p>
    <p>From now on, your internship schedule can be synced to your Google Calendar.</p>
    <p>
      <a href="${dashboardUrl}" target="_blank" rel="noopener"
         style="display:inline-block;background:#0ea5a4;color:#fff;padding:10px 14px;border-radius:8px;
                text-decoration:none;font-weight:600;">
        Open SkillNaav
      </a>
    </p>
    <p>If you have any questions, reply to this email and we’ll help.</p>
  `;

    return await notifyUser(to, subject, bodyHtml);
}

module.exports = {
    sendGoogleAuthPromptEmail,
    sendGoogleAuthSuccessEmail,
};
