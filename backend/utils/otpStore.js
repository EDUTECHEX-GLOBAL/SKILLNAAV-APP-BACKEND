// backend/utils/otpStore.js
// Minimal in-memory OTP store with expiry and verified flag.

const DEFAULT_TTL_MS =
    (process.env.OTP_TTL_MIN ? Number(process.env.OTP_TTL_MIN) : 10) * 60 * 1000;

const store = new Map(); // email -> { code, expiresAt, verified, verifiedAt }

function issueOtp(email, ttlMs = DEFAULT_TTL_MS) {
    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
    const rec = { code, expiresAt: Date.now() + ttlMs, verified: false, verifiedAt: null };
    store.set((email || "").toLowerCase(), rec);
    return code;
}

function verifyOtp(email, code) {
    const rec = store.get((email || "").toLowerCase());
    if (!rec) return false;
    if (Date.now() > rec.expiresAt) return false;
    if (String(code).trim() !== rec.code) return false;
    rec.verified = true;
    rec.verifiedAt = Date.now();
    return true;
}

function isVerified(email) {
    const rec = store.get((email || "").toLowerCase());
    if (!rec) return false;
    if (Date.now() > rec.expiresAt) return false;
    return rec.verified === true;
}

function clearOtp(email) {
    store.delete((email || "").toLowerCase());
}

module.exports = { issueOtp, verifyOtp, isVerified, clearOtp };
