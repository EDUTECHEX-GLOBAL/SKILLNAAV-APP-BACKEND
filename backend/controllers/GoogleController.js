// GoogleController.js
require('dotenv').config();
const { google } = require('googleapis');
const TokenModel = require('../models/webapp-models/TokenModel');
const jwt = require('jsonwebtoken');
const InternshipScheduleModel = require('../models/webapp-models/InternshipScheduleModel');

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;

// ---- Host + Redirect config (purely env-driven) ----
const stripTrailingSlash = (s = "") => s.replace(/\/+$/, "");

const SERVER_BASE_URL = stripTrailingSlash(process.env.SERVER_BASE_URL || "");
const FRONTEND_BASE_URL = stripTrailingSlash(process.env.FRONTEND_BASE_URL || "");

// Prefer explicit GOOGLE_REDIRECT_URI; otherwise compose from SERVER_BASE_URL
const GOOGLE_REDIRECT_URI = stripTrailingSlash(
  process.env.GOOGLE_REDIRECT_URI || (SERVER_BASE_URL ? `${SERVER_BASE_URL}/api/google/callback` : "")
);

// (optional; keep only if you use cookie options anywhere)
const IS_HTTPS = /^https:\/\//i.test(SERVER_BASE_URL);

// Validate environment variables (use computed GOOGLE_REDIRECT_URI)
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  throw new Error("⚠️ GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing.");
}
if (!GOOGLE_REDIRECT_URI) {
  throw new Error("⚠️ Missing redirect URI. Set GOOGLE_REDIRECT_URI or SERVER_BASE_URL in .env.");
}

// Where to land in the UI after a successful Google auth
const AFTER_AUTH_PATH = process.env.AFTER_AUTH_PATH || "/user-main-page?tab=offer-letter&gauth=success";

// ── Live Sync Progress (in-memory) ──────────────────────────────
const syncProgressStore = new Map(); // key: `${internshipId}:${studentEmail}`
const pk = (internshipId, email) => `${String(internshipId)}:${String(email).toLowerCase()}`;

function setProgress(internshipId, email, patch) {
  const key = pk(internshipId, email);
  const prev = syncProgressStore.get(key) || {};
  const next = { ...prev, ...patch, ts: Date.now() };
  syncProgressStore.set(key, next);
  return next;
}
function getProgress(internshipId, email) {
  return syncProgressStore.get(pk(internshipId, email)) || null;
}
function clearProgress(internshipId, email) {
  syncProgressStore.delete(pk(internshipId, email));
}

const googleAuth = (req, res) => {
  // Create new OAuth client per request to avoid shared state
  const oAuth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );

  // Generate random state for security
  // Accept caller-provided state (base64 JSON) if present; else random.
  const incomingState = typeof req.query.state === 'string' ? req.query.state : null;
  const state = incomingState || Math.random().toString(36).substring(2, 15);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: [
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ],
    state,
    response_type: 'code',
    redirect_uri: GOOGLE_REDIRECT_URI
  });

  console.log('Generated auth URL with state:', state);
  res.redirect(authUrl);
};

const googleCallback = async (req, res) => {
  const { code, state, error } = req.query;

  console.log('OAuth callback received:', {
    hasCode: !!code,
    state,
    error,
    fullUrl: req.url
  });

  // Handle OAuth errors
  if (error) {
    console.error("OAuth error:", error);
    return res.status(400).send(`Authentication error: ${error}`);
  }

  if (!code) {
    return res.status(400).send("Missing authorization code");
  }

  try {
    console.log('Starting token exchange process...');

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);
    console.log('Successfully obtained tokens via manual exchange');

    // Create OAuth client and set credentials
    const oAuth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );

    oAuth2Client.setCredentials(tokens);

    // Get email from ID token first
    let email;
    if (tokens.id_token) {
      try {
        const decoded = jwt.decode(tokens.id_token);
        email = decoded?.email;
        console.log("Email from ID token:", email);
      } catch (decodeErr) {
        console.warn("ID token decode error:", decodeErr.message);
      }
    }

    // Fallback to userinfo API if email not found in ID token
    if (!email) {
      try {
        const oauth2 = google.oauth2({
          version: 'v2',
          auth: oAuth2Client
        });
        const { data } = await oauth2.userinfo.get();
        email = data.email;
        console.log("Email from userinfo API:", email);
      } catch (userinfoErr) {
        console.error("Userinfo API error:", userinfoErr.message);
      }
    }

    if (!email) {
      throw new Error("Failed to retrieve user email from Google");
    }

    // Store tokens with email (preserve old refresh_token if Google didn't send one)
    // Also stamp which OAuth client minted these tokens
    const setFields = {
      'tokens.access_token': tokens.access_token,
      'tokens.expiry_date': tokens.expiry_date,
      'tokens.scope': tokens.scope,
      'tokens.token_type': tokens.token_type,
      'tokens.id_token': tokens.id_token,
      'tokens.client_id': GOOGLE_CLIENT_ID,
      updatedAt: new Date()
    };
    if (tokens.refresh_token) {
      setFields['tokens.refresh_token'] = tokens.refresh_token;
    }

    const tokenDoc = await TokenModel.findOneAndUpdate(
      { email },
      { $set: setFields },
      { upsert: true, new: true }
    );

    console.log(`Successfully stored tokens for ${email}`);

    // Send "Google auth successful" mail (best effort; do not block callback)
    try {
      const { sendGoogleAuthSuccessEmail } = require("../utils/googleAuthMailer");
      // If you store instructor names elsewhere and want to include them, look them up here.
      await sendGoogleAuthSuccessEmail({ to: email });
    } catch (e) {
      console.warn("[googleCallback] success mail failed:", e?.message || e);
    }
    // ✅ Do NOT sync here anymore. Only confirm auth and return to UI.

    // (Optional) decode caller state if you need it later
    let statePayload = null;
    try {
      if (state) {
        statePayload = JSON.parse(Buffer.from(String(state), 'base64').toString('utf8'));
      }
    } catch (e) {
      console.warn('Invalid state payload (ignored):', e.message);
    }

    // ✅ No interstitial page; go straight back to Offer Letter.
    // We rely on ?gauth=success in AFTER_AUTH_PATH and the front-end shows the popup.
    const redirectUrl = `${FRONTEND_BASE_URL}${AFTER_AUTH_PATH}`;
    return res.redirect(302, redirectUrl);

  } catch (err) {
    console.error("Google callback error:", {
      message: err.message,
      code: err.code,
      stack: err.stack,
      response: err.response?.data || 'No response data'
    });

    let errorMessage = "Authentication failed";
    if (err.message.includes('invalid_grant')) {
      errorMessage = "The authorization code has expired or is invalid. Please try clearing your browser cache and try again.";
    } else if (err.message.includes('redirect_uri_mismatch')) {
      errorMessage = "Redirect URI mismatch. Please check your Google OAuth configuration.";
    } else if (err.message.includes('invalid_client')) {
      errorMessage = "Invalid client credentials. Please check your Google OAuth setup.";
    }

    res.status(500).send(`
      <html>
        <head>
          <title>Authentication Failed</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .error { color: #dc3545; }
          </style>
        </head>
        <body>
          <h1 class="error">Authentication Failed</h1>
          <p>${errorMessage}</p>
          <p>Error details: ${err.message}</p>
          <a href="${SERVER_BASE_URL}/api/google/auth">Try Again</a>
        </body>
      </html>
    `);
  }
};

// Manual token exchange function
const https = require('https');
const querystring = require('querystring');

// --- Transient error backoff helper ---
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function withRetry(op, { retries = 3, baseMs = 400 } = {}) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await op();
    } catch (e) {
      const status = e?.code || e?.response?.status;
      const reason =
        e?.response?.data?.error?.errors?.[0]?.reason ||
        e?.errors?.[0]?.reason ||
        "";

      const transient =
        [429, 500, 502, 503, 504].includes(status) ||
        /rateLimitExceeded|userRateLimitExceeded|backendError|internalError|timeout/i.test(String(reason));

      if (!transient || attempt >= retries) throw e;

      await sleep(Math.pow(2, attempt) * baseMs);
      attempt++;
    }
  }
}

async function exchangeCodeForTokens(code) {
  const postData = querystring.stringify({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    code: code,
    grant_type: 'authorization_code',
    redirect_uri: GOOGLE_REDIRECT_URI
  });

  console.log("Sending token request to Google with:");
  console.log("Client ID present:", !!process.env.GOOGLE_CLIENT_ID);
  console.log("Redirect URI:", GOOGLE_REDIRECT_URI);

  const options = {
    hostname: 'oauth2.googleapis.com',
    port: 443,
    path: '/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);

          if (response.error) {
            console.error('❌ Token exchange error response:', response);
            reject(new Error(response.error_description || response.error));
          } else {
            console.log('✅ Token exchange successful');
            resolve(response);
          }
        } catch (parseErr) {
          console.error('❌ Failed to parse token response:', data);
          reject(new Error('Invalid response from Google OAuth'));
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ Token exchange request error:', err);
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

// Create a test event immediately after authentication
const createTestEvent = async (email) => {
  console.log('🧪 Creating test event for:', email);

  try {
    const studentToken = await TokenModel.findOne({ email });
    if (!studentToken || !studentToken.tokens) {
      throw new Error(`No tokens found for ${email}`);
    }

    const oAuth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );

    oAuth2Client.setCredentials(studentToken.tokens);
    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

    const now = new Date();
    const startTime = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

    const testEvent = {
      summary: 'Test: Calendar connectivity',   // ← added
      start: { dateTime: startTime.toISOString(), timeZone: 'Asia/Kolkata' },
      end: { dateTime: endTime.toISOString(), timeZone: 'Asia/Kolkata' },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] },
      colorId: '1',
      status: 'confirmed',
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: testEvent
    });

    return {
      success: true,
      eventId: response.data.id,
      htmlLink: response.data.htmlLink,
      message: 'Test event created successfully'
    };

  } catch (err) {
    console.error('🧪 Test event creation failed:', err);
    return { success: false, error: err.message };
  }
};

// Enhanced function to add schedule to Google Calendar

// ✅ Function for Online Events
function buildOnlineEvent({ slot, dateStr, startDateTime, endDateTime, internshipTitle, finalEventLink }) {
  return {
    summary: `Online Section by ${slot.instructor || 'Instructor'}`,
    description: `Topic: ${slot.sectionSummary || 'Internship session'}
    
👨‍🏫 Instructor Name: ${slot.instructor || 'Not assigned'}

🔗 Online Meeting Link: ${finalEventLink || 'Link not available'}

📅 Date: ${formatDate(dateStr)}
⏰ Time: ${slot.startTime} - ${slot.endTime} (IST)

Generated on: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
    `,
    start: { dateTime: startDateTime, timeZone: 'Asia/Kolkata' },
    end: { dateTime: endDateTime, timeZone: 'Asia/Kolkata' },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 1440 }, // 1 day before
        { method: 'popup', minutes: 60 },
        { method: 'popup', minutes: 15 },
        { method: 'popup', minutes: 1 }
      ]
    },
    colorId: '9',
    visibility: 'default',
    status: 'confirmed',
    conferenceData: (!finalEventLink && slot.includeMeet !== false) ? {
      createRequest: {
        requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    } : undefined
  };
}

// ✅ Function for Offline Events
function buildOfflineEvent({ slot, dateStr, startDateTime, endDateTime, internshipTitle }) {
  return {
    summary: `Offline Section by ${slot.instructor || 'Instructor'}`,
    description: `Topic: ${slot.sectionSummary || 'Internship session'}

👨‍🏫 Instructor Name: ${slot.instructor || 'Not assigned'}
📅 Date: ${formatDate(dateStr)}
⏰ Time: ${slot.startTime} - ${slot.endTime} (IST)

📍 Location: ${slot.location?.address || 'Offline'}

${slot.location?.mapLink ? `🗺️ Map: ${slot.location.mapLink}` : ''}

Generated on: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
    `,
    location: slot.location?.mapLink || 'Offline',
    start: { dateTime: startDateTime, timeZone: 'Asia/Kolkata' },
    end: { dateTime: endDateTime, timeZone: 'Asia/Kolkata' },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 1440 }, // 1 day before
        { method: 'popup', minutes: 60 },
        { method: 'popup', minutes: 15 },
        { method: 'popup', minutes: 1 }
      ]
    },
    colorId: '9',
    visibility: 'default',
    status: 'confirmed'
  };
}

// Use upsert so any caller of this function won't create duplicates.
const addScheduleToGoogleCalendar = async ({
  studentEmail,
  timetable,
  internshipTitle,
  defaultEventLink,
  internshipId // <-- pass this whenever you can
}) => {
  return upsertScheduleForStudent({
    studentEmail,
    internshipId: String(internshipId || 'global'), // temporary fallback if id isn't available
    timetable,
    internshipTitle,
    defaultEventLink: defaultEventLink || ''
  });
};


// === Upsert schedule to a student's calendar by extendedProperties.private ===
async function upsertScheduleForStudent({
  studentEmail,
  internshipId,
  timetable,
  internshipTitle = 'Internship Schedule',
  defaultEventLink = ''
}) {
  try {
    // 0) Load tokens
    const studentToken = await TokenModel.findOne({ email: studentEmail });
    if (!studentToken?.tokens) {
      return { success: false, message: `No Google auth for ${studentEmail}` };
    }

    // Require a refresh token; without it we can’t refresh -> force re-link (and wipe stale token)
    if (!studentToken.tokens.refresh_token) {
      await TokenModel.deleteOne({ email: studentEmail }).catch(() => { });
      setProgress(internshipId, studentEmail, {
        phase: 'error',
        code: 'NEED_REAUTH',
        error: 'Missing refresh token. Please re-link Google Calendar.'
      });
      setTimeout(() => clearProgress(internshipId, studentEmail), 5 * 60 * 1000);
      return { success: false, message: 'NEED_REAUTH' };
    }

    // If the stored token was minted by another OAuth client (e.g. OAuth Playground), force re-auth once
    if (studentToken.tokens.client_id && studentToken.tokens.client_id !== GOOGLE_CLIENT_ID) {
      await TokenModel.deleteOne({ _id: studentToken._id }).catch(() => { });
      return { success: false, message: 'NEED_REAUTH: Token belongs to another OAuth client. Please re-link.' };
    }

    // 1) Auth
    const oAuth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );
    oAuth2Client.setCredentials({
      access_token: studentToken.tokens.access_token,
      refresh_token: studentToken.tokens.refresh_token,
      expiry_date: studentToken.tokens.expiry_date
    });

    // 🔄 Persist refreshed tokens automatically (never drop refresh_token if Google omits it)
    oAuth2Client.on('tokens', async (tokens) => {
      try {
        const setFields = {
          'tokens.client_id': GOOGLE_CLIENT_ID
        };
        if (tokens.access_token) setFields['tokens.access_token'] = tokens.access_token;
        if (typeof tokens.expiry_date !== 'undefined') setFields['tokens.expiry_date'] = tokens.expiry_date;
        if (tokens.scope) setFields['tokens.scope'] = tokens.scope;
        if (tokens.token_type) setFields['tokens.token_type'] = tokens.token_type;
        if (tokens.id_token) setFields['tokens.id_token'] = tokens.id_token;
        // Only update refresh_token if Google actually sent one
        if (tokens.refresh_token) setFields['tokens.refresh_token'] = tokens.refresh_token;

        await TokenModel.updateOne(
          { email: studentEmail },
          { $set: setFields },
          { upsert: true }
        );
      } catch (e) {
        console.error('Token upsert error:', e);
      }
    });

    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

    // 2) Validate timetable
    if (!Array.isArray(timetable) || timetable.length === 0) {
      return { success: false, message: 'Empty timetable' };
    }

    // Counters and error bag for reporting back to UI
    const counts = { total: timetable.length, created: 0, updated: 0, deleted: 0 };
    const errors = [];

    // initialize live progress
    setProgress(internshipId, studentEmail, {
      total: counts.total, created: 0, updated: 0, deleted: 0, synced: 0, phase: "working"
    });

    // 3) Build a window to list existing events (min..max date +-1 day)
    const dates = timetable.map(s => new Date(
      s.date instanceof Date ? s.date : (String(s.date).includes('T') ? s.date : `${s.date}T00:00:00.000Z`)
    ));
    const timeMin = new Date(Math.min(...dates));
    const timeMax = new Date(Math.max(...dates));
    timeMin.setDate(timeMin.getDate() - 1);
    timeMax.setDate(timeMax.getDate() + 1);

    // 4) List events tagged for this internship
    const existing = [];
    let pageToken;
    do {
      const resp = await withRetry(() => calendar.events.list({
        calendarId: 'primary',
        privateExtendedProperty: `internshipId=${String(internshipId)}`,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        maxResults: 2500,
        pageToken,
      }));
      existing.push(...(resp.data.items || []));
      pageToken = resp.data.nextPageToken;
    } while (pageToken);

    const existingBySlotKey = new Map(
      existing
        .map(e => [e.extendedProperties?.private?.slotKey, e])
        .filter(([k]) => !!k)
    );

    // 5) Upsert every slot
    const seenKeys = new Set();

    for (const slot of timetable) {
      const key = slotKeyOf(slot);
      seenKeys.add(key);

      // Prepare date/time strings
      let dateStr;
      if (slot.date instanceof Date) {
        dateStr = slot.date.toISOString().split('T')[0];
      } else if (typeof slot.date === 'string') {
        dateStr = slot.date.includes('T') ? slot.date.split('T')[0] : slot.date;
      } else {
        errors.push({ key, code: 'BAD_INPUT', message: `Invalid slot.date: ${slot.date}` });
        continue;
      }

      // Preflight validation to avoid throwing mid-run
      if (!isValidDate(dateStr) || !isValidTime(slot.startTime) || !isValidTime(slot.endTime)) {
        errors.push({
          key,
          code: 'BAD_INPUT',
          message: `Invalid date/time for ${dateStr} ${slot.startTime}-${slot.endTime}`,
        });
        continue;
      }

      const startDateTime = createISTDateTime(dateStr, slot.startTime);
      let endDateTime = createISTDateTime(dateStr, slot.endTime);

      // Handle end next day if needed
      const [sh, sm] = slot.startTime.split(':').map(Number);
      const [eh, em] = slot.endTime.split(':').map(Number);
      if (eh < sh || (eh === sh && em <= sm)) {
        const endDateObj = new Date(`${dateStr}T00:00:00.000Z`);
        endDateObj.setDate(endDateObj.getDate() + 1);
        const nextDateStr = endDateObj.toISOString().split('T')[0];
        endDateTime = createISTDateTime(nextDateStr, slot.endTime);
      }

      // Build event (reuse your existing builders)
      const finalEventLink = slot.eventLink || defaultEventLink || '';

      let baseEvent;
      if (slot.type === 'offline') {
        baseEvent = buildOfflineEvent({ slot, dateStr, startDateTime, endDateTime, internshipTitle });
      } else if (slot.type === 'online') {
        baseEvent = buildOnlineEvent({ slot, dateStr, startDateTime, endDateTime, internshipTitle, finalEventLink });
      } else if (slot.type === 'hybrid') {
        baseEvent = (slot.location?.address)
          ? buildOfflineEvent({ slot, dateStr, startDateTime, endDateTime, internshipTitle })
          : buildOnlineEvent({ slot, dateStr, startDateTime, endDateTime, internshipTitle, finalEventLink });
      } else {
        // default to online formatting to be safe
        baseEvent = buildOnlineEvent({ slot, dateStr, startDateTime, endDateTime, internshipTitle, finalEventLink });
      }

      const body = withExtendedProps(baseEvent, { internshipId, slot });

      // PATCH if exists; otherwise INSERT — with retry & Meet fallback
      const existingEvent = existingBySlotKey.get(key);

      try {
        if (existingEvent) {
          // PATCH with retry; if Meet creation is blocked, retry without conferenceData
          try {
            const patchParams = { calendarId: 'primary', eventId: existingEvent.id, requestBody: body };
            if (body.conferenceData) patchParams.conferenceDataVersion = 1;
            await withRetry(() => calendar.events.patch(patchParams));
          } catch (e) {
            const msg = e?.response?.data?.error?.message || e.message || '';
            if (/conferenceData|forbidden/i.test(msg) && body.conferenceData) {
              const bodyNoConf = { ...body };
              delete bodyNoConf.conferenceData;
              await withRetry(() => calendar.events.patch({
                calendarId: 'primary',
                eventId: existingEvent.id,
                requestBody: bodyNoConf,
                // no conferenceDataVersion when not sending conferenceData
              }));
            } else {
              throw e;
            }
          }
          counts.updated += 1;
        } else {
          // INSERT with retry; Meet fallback if blocked
          try {
            const insertParams = { calendarId: 'primary', requestBody: body };
            if (body.conferenceData) insertParams.conferenceDataVersion = 1;
            await withRetry(() => calendar.events.insert(insertParams));
          } catch (e) {
            const msg = e?.response?.data?.error?.message || e.message || '';
            if (/conferenceData|forbidden/i.test(msg) && body.conferenceData) {
              const bodyNoConf = { ...body };
              delete bodyNoConf.conferenceData;
              await withRetry(() => calendar.events.insert({
                calendarId: 'primary',
                requestBody: bodyNoConf,
                // no conferenceDataVersion when not sending conferenceData
              }));
            } else {
              throw e;
            }
          }
          counts.created += 1;
        }
      } catch (e) {
        errors.push({ key, code: 'UPSERT_FAILED', message: e.message || String(e) });
      }

      // Publish live progress after this item
      setProgress(internshipId, studentEmail, {
        created: counts.created,
        updated: counts.updated,
        deleted: counts.deleted,
        synced: counts.created + counts.updated + counts.deleted
      });
    }

    // 6) Delete stale events
    for (const [key, ev] of existingBySlotKey.entries()) {
      if (!seenKeys.has(key)) {
        try {
          await withRetry(() => calendar.events.delete({ calendarId: 'primary', eventId: ev.id }));
          counts.deleted += 1;
        } catch (e) {
          errors.push({ key, code: 'DELETE_FAILED', message: e.message || String(e) });
          // keep going
        }
      }
    }

    // mark as done and schedule cleanup
    setProgress(internshipId, studentEmail, {
      total: counts.total,
      created: counts.created,
      updated: counts.updated,
      deleted: counts.deleted,
      synced: counts.created + counts.updated + counts.deleted,
      phase: "done"
    });
    setTimeout(() => clearProgress(internshipId, studentEmail), 5 * 60 * 1000);
    return { success: true, counts, errors };

  } catch (e) {
    const resp = e?.response;
    const status = resp?.status || e?.code;
    const payload = `${resp?.data?.error || ''} ${resp?.data?.error_description || ''} ${e?.message || ''}`;

    const isInvalidGrant =
      (status === 400 && (/invalid[_-]grant/i.test(payload))) ||
      /invalid[_-]grant/i.test(String(e));

    const tokenAuthFail =
      isInvalidGrant ||
      status === 401 ||
      /invalid[_-]?credentials|unauthorized|insufficient.*permissions/i.test(payload);

    if (tokenAuthFail) {
      // Wipe the bad token so the next attempt forces a clean re-auth
      await TokenModel.deleteOne({ email: studentEmail }).catch(() => { });
      setProgress(internshipId, studentEmail, {
        phase: 'error',
        code: 'NEED_REAUTH',
        error: 'Google authorization expired or was revoked. Please re-link Google Calendar.'
      });
      setTimeout(() => clearProgress(internshipId, studentEmail), 5 * 60 * 1000);
      return { success: false, message: 'NEED_REAUTH' };
    }

    console.error('upsertScheduleForStudent error:', e);
    return { success: false, message: e.message };
  }
}

// Helper functions
function isValidDate(dateString) {
  if (!dateString || typeof dateString !== 'string') return false;
  const regEx = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateString.match(regEx)) return false;

  const date = new Date(dateString + 'T00:00:00.000Z');
  return date instanceof Date && !isNaN(date.getTime());
}

function isValidTime(timeString) {
  if (!timeString || typeof timeString !== 'string') return false;
  const regEx = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return timeString.match(regEx) !== null;
}

function createISTDateTime(dateString, timeString) {
  // Create proper ISO string for IST timezone
  return `${dateString}T${timeString}:00+05:30`;
}

function formatDate(dateString) {
  const date = new Date(dateString + 'T00:00:00.000Z');
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// === Unique key for a slot (per day + start time) ===
function slotKeyOf(slot) {
  // slot.date may be Date or string; normalize to YYYY-MM-DD
  const dateStr = (slot.date instanceof Date)
    ? slot.date.toISOString().slice(0, 10)
    : (typeof slot.date === 'string' && slot.date.includes('T'))
      ? slot.date.split('T')[0]
      : String(slot.date);

  return `${dateStr}_${slot.startTime}`;
}

// === Attach private extended properties so we can find/update/delete later ===
function withExtendedProps(baseEvent, { internshipId, slot }) {
  return {
    ...baseEvent,
    extendedProperties: {
      private: {
        internshipId: String(internshipId),
        slotKey: slotKeyOf(slot),
      },
    },
  };
}

// Test function with immediate execution
const debugCalendarCreation = async (studentEmail) => {
  console.log('🧪 Starting debug calendar creation for:', studentEmail);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split('T')[0];

  const testTimetable = [
    {
      date: dateStr,
      startTime: '15:00',
      endTime: '16:00',
      sectionSummary: 'Debug Test Session',
      instructor: 'Debugger',
      type: 'online',
      eventLink: '',
      includeMeet: true
    }
  ];

  const result = await upsertScheduleForStudent({
    studentEmail,
    internshipId: 'debug',
    timetable: testTimetable,
    internshipTitle: '🧪 Debug Test Internship'
  });

  console.log('🧪 Debug result:', JSON.stringify(result, null, 2));
  return result;
};

// Function to check authentication status
const checkAuthStatus = async (studentEmail) => {
  try {
    const studentToken = await TokenModel.findOne({ email: studentEmail });

    if (!studentToken || !studentToken.tokens) {
      return {
        authenticated: false,
        message: 'No authentication tokens found',
        action: 'Please authenticate with Google'
      };
    }

    // Test if tokens are still valid
    const oAuth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );

    oAuth2Client.setCredentials(studentToken.tokens);

    try {
      const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
      await calendar.calendarList.list();

      return {
        authenticated: true,
        email: studentEmail,
        tokenInfo: {
          hasAccessToken: !!studentToken.tokens.access_token,
          hasRefreshToken: !!studentToken.tokens.refresh_token,
          expiryDate: studentToken.tokens.expiry_date
        },
        message: 'Authentication valid'
      };
    } catch (apiErr) {
      // If token-based failure, wipe tokens so next attempt forces re-auth
      if (apiErr?.code === 401 || apiErr?.response?.status === 401) {
        await TokenModel.deleteOne({ email: studentEmail }).catch(() => { });
      }
      return {
        authenticated: false,
        message: 'Authentication expired or invalid',
        error: apiErr.message,
        action: 'Please re-authenticate with Google'
      };
    }

  } catch (err) {
    return {
      authenticated: false,
      message: 'Error checking authentication status',
      error: err.message
    };
  }
};

// GET /api/google/sync-status?internshipId=...&studentEmail=...
const getSyncStatus = async (req, res) => {
  try {
    const { internshipId, studentEmail } = req.query;
    if (!internshipId || !studentEmail) {
      return res.status(400).json({ error: "Missing internshipId or studentEmail" });
    }
    const progress = getProgress(internshipId, studentEmail) || {
      total: 0, created: 0, updated: 0, deleted: 0, synced: 0, phase: "idle"
    };
    return res.json({ progress });
  } catch (e) {
    return res.status(500).json({ error: "Failed to read progress" });
  }
};

// POST /api/google/update-schedule
const updateScheduleInGoogleCalendar = async (req, res) => {
  try {
    const { internshipId, studentEmail } = req.body;

    const studentToken = await TokenModel.findOne({ email: studentEmail });
    if (!studentToken?.tokens) {
      // first-time users are not authenticated yet
      return res.status(401).json({ success: false, message: "Student not authenticated with Google" });
    }

    const scheduleDoc = await InternshipScheduleModel.findOne({ internshipId });
    if (!scheduleDoc || !Array.isArray(scheduleDoc.timetable)) {
      return res.status(404).json({ success: false, message: "No schedule found" });
    }

    // Initialize live progress immediately so the UI can show totals
    setProgress(internshipId, studentEmail, {
      total: Array.isArray(scheduleDoc.timetable) ? scheduleDoc.timetable.length : 0,
      created: 0, updated: 0, deleted: 0, synced: 0, phase: "working"
    });

    // Kick off the heavy work *after* responding, so we never hit the gateway timeout
    setImmediate(async () => {
      try {
        const result = await upsertScheduleForStudent({
          studentEmail,
          internshipId,
          timetable: scheduleDoc.timetable,
          internshipTitle: scheduleDoc.internshipTitle || 'Internship Schedule',
          defaultEventLink: scheduleDoc.defaultEventLink || ''
        });

        if (!result.success) {
          const msg = String(result.message || 'Failed to update schedule');
          setProgress(internshipId, studentEmail, { phase: "error", error: msg });
          setTimeout(() => clearProgress(internshipId, studentEmail), 5 * 60 * 1000);
        }
        // On success, upsertScheduleForStudent already sets phase:"done" and clears later.
      } catch (e) {
        console.error('Async updateScheduleInGoogleCalendar failed:', e);
        setProgress(internshipId, studentEmail, { phase: "error", error: String(e.message || e) });
        setTimeout(() => clearProgress(internshipId, studentEmail), 5 * 60 * 1000);
      }
    });

    // Return immediately so the proxy never times out
    return res.status(202).json({ success: true, started: true });
  } catch (error) {
    console.error("Error updating schedule in calendar:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  googleAuth,
  googleCallback,
  addScheduleToGoogleCalendar,
  debugCalendarCreation,
  checkAuthStatus,
  createTestEvent,
  updateScheduleInGoogleCalendar,
  upsertScheduleForStudent,
  getSyncStatus,
};