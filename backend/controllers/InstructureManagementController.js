// backend/controllers/InstructureManagementController.js
const fs = require("fs");
const path = require("path");
const Instructure = require("../models/webapp-models/InstructureManagementModel");
// ADD: email helper to notify instructors after creation
const { sendInstructorCreatedEmail } = require("../utils/instructorMailer");
// ADD (top)
const notifyUser = require("../utils/notifyUser"); // uses your EMAIL_* env
const { issueOtp, verifyOtp, isVerified, clearOtp } = require("../utils/otpStore");
// ADD: S3 upload deps
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const crypto = require("crypto");

// ADD: S3 client
const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    } : undefined,
});

// Map each field to a bucket from your .env
const bucketFor = (field) => {
    if (field === "resume") return process.env.AWS_RESUME_BUCKET;
    if (field === "photo") return process.env.AWS_PROFILE_PIC_BUCKET;
    if (field === "certificates") return process.env.AWS_IMAGE_BUCKET || process.env.AWS_PROFILE_PIC_BUCKET || process.env.AWS_RESUME_BUCKET;
    // default fallback
    return process.env.AWS_IMAGE_BUCKET || process.env.AWS_RESUME_BUCKET;
};

// Map field to the folder (key prefix) you want in S3
// Per your examples: resume -> "resumes/...", images (photo/certificates) -> "jobs/..."
const keyPrefixFor = (field) => (field === "resume" ? "resumes" : "jobs");

// Build a filename like: 1752840415245-508278277.png
const randomSuffix = () => `${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`;

// Encode each path segment but preserve folder slashes
const encodeS3KeyForUrl = (k) => k.split("/").map(encodeURIComponent).join("/");
const httpsUrl = (bucket, key) =>
    `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${encodeS3KeyForUrl(key)}`;

// REPLACE this function
const fileToMeta = async (file) => {
    if (!file) return undefined;

    // infer fieldname: "resume" | "photo" | "certificates"
    const field = file.fieldname;
    const bucket = bucketFor(field);
    if (!bucket) return undefined;

    const ext = path.extname(file.originalname) || "";
    const key = `${keyPrefixFor(field)}/${randomSuffix()}${ext}`;

    // stream the temp file to S3
    const Body = fs.createReadStream(file.path);
    await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body,
        ContentType: file.mimetype || "application/octet-stream",
        // No ACL here — bucket has "Bucket owner enforced" (ACLs disabled)
    }));

    // remove temp file quietly
    try { fs.unlink(file.path, () => { }); } catch (_) { }

    // return the doc to store in Mongo
    return {
        url: httpsUrl(bucket, key),         // e.g. https://skillnaavres.s3.us-west-1.amazonaws.com/jobs/1752-...png
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
    };
};

const parsePayload = (req) => {
    // 1) If payload is a text field
    if (req.body && typeof req.body.payload === "string") {
        return JSON.parse(req.body.payload);
    }
    // 2) If payload came as a Blob/file part named "payload"
    if (req.files && req.files.payload && req.files.payload[0]) {
        const f = req.files.payload[0];
        const raw = fs.readFileSync(f.path, "utf8");
        fs.unlink(f.path, () => { });
        return JSON.parse(raw);
    }
    return null;
};

exports.createInstructure = async (req, res) => {
    try {
        const payload = parsePayload(req);
        if (!payload) return res.status(400).json({ message: "Missing payload JSON." });

        if (payload.availableStart && payload.availableEnd && payload.availableEnd <= payload.availableStart) {
            return res.status(400).json({ message: "End Time must be after Start Time." });
        }

        // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>  ADD THIS BLOCK  <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
        // OTP email verification guard (run BEFORE handling files or saving)
        const emailToCheck = (payload?.email || "").trim().toLowerCase();
        if (!emailToCheck) {
            return res.status(400).json({ message: "Email is required." });
        }
        if (!isVerified(emailToCheck)) {
            return res.status(400).json({
                message: "Email not verified. Please complete OTP verification and try again.",
            });
        }
        // <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<  ADD THIS BLOCK  >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

        const resumeFile = req.files?.resume?.[0];
        const photoFile = req.files?.photo?.[0];
        const certFiles = req.files?.certificates || [];

        // OLD (disk):
        // files.resume = fileToMeta(resumeFile);
        // if (photoFile) files.photo = fileToMeta(photoFile);
        // if (certFiles.length) files.certificates = certFiles.map(fileToMeta).filter(Boolean);

        // REPLACE WITH (S3, async):
        const files = {};
        if (!resumeFile) return res.status(400).json({ message: "Resume is required." });
        files.resume = await fileToMeta(resumeFile);
        if (photoFile) files.photo = await fileToMeta(photoFile);
        if (certFiles.length) files.certificates = (await Promise.all(certFiles.map(fileToMeta))).filter(Boolean);

        // Then include ...files when creating the document:
        const created = await Instructure.create({ ...payload, ...files });

        // Try sending the notification email to the instructor.
        // Do NOT fail the API if email fails — just log the error.
        try {
            await sendInstructorCreatedEmail(created);
            // Send Google Calendar auth prompt mail (non-blocking)
            try {
                const { sendGoogleAuthPromptEmail } = require("../utils/googleAuthMailer");
                await sendGoogleAuthPromptEmail({
                    to: created.email,
                    firstName: created.firstName,
                    lastName: created.lastName,
                    // optional state payload (add what you like):
                    statePayload: { createdAt: String(created.createdAt || new Date()) },
                });
            } catch (e) {
                console.error("[createInstructure] Google auth prompt mail failed:", e?.message || e);
            }
        } catch (mailErr) {
            console.error("[createInstructure] Email send failed:", mailErr?.message || mailErr);
        }

        // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>  ADD THIS LINE  <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
        // Clear OTP for this verified email after successful create (+mail)
        try { clearOtp(emailToCheck); } catch (_) { }
        // <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<  ADD THIS LINE  >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

        return res.status(201).json(created);
    } catch (err) {
        console.error("createInstructure error:", err);
        return res.status(500).json({ message: "Failed to create instructure." });
    }
};

exports.listInstructures = async (req, res) => {
    try {
        const { q = "", page = 1, limit = 20 } = req.query;
        const query = q
            ? {
                $or: [
                    { firstName: new RegExp(q, "i") },
                    { lastName: new RegExp(q, "i") },
                    { email: new RegExp(q, "i") },
                    { phone: new RegExp(q, "i") },
                    { city: new RegExp(q, "i") },
                    { state: new RegExp(q, "i") },
                    { specializations: { $in: [new RegExp(q, "i")] } },
                    { skills: { $in: [new RegExp(q, "i")] } },
                    { languages: { $in: [new RegExp(q, "i")] } },
                ],
            }
            : {};

        const skip = (Number(page) - 1) * Number(limit);
        const [items, total] = await Promise.all([
            Instructure.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
            Instructure.countDocuments(query),
        ]);

        return res.json({ items, total, page: Number(page), limit: Number(limit) });
    } catch (err) {
        console.error("listInstructures error:", err);
        return res.status(500).json({ message: "Failed to fetch instructures." });
    }
};

exports.getInstructure = async (req, res) => {
    try {
        const item = await Instructure.findById(req.params.id);
        if (!item) return res.status(404).json({ message: "Instructure not found." });
        return res.json(item);
    } catch (err) {
        console.error("getInstructure error:", err);
        return res.status(500).json({ message: "Failed to fetch instructure." });
    }
};

exports.updateInstructure = async (req, res) => {
    try {
        let patch = {};
        if (req.is("multipart/form-data")) {
            const payload = parsePayload(req);
            if (payload) patch = payload;

            const resumeFile = req.files?.resume?.[0];
            const photoFile = req.files?.photo?.[0];
            const certFiles = req.files?.certificates || [];

            if (resumeFile) patch.resume = await fileToMeta(resumeFile);
            if (photoFile) patch.photo = await fileToMeta(photoFile);
            if (certFiles.length) patch.certificates = (await Promise.all(certFiles.map(fileToMeta))).filter(Boolean);
        } else {
            patch = req.body || {};
        }

        if (patch.availableStart && patch.availableEnd && patch.availableEnd <= patch.availableStart) {
            return res.status(400).json({ message: "End Time must be after Start Time." });
        }

        const updated = await Instructure.findByIdAndUpdate(req.params.id, patch, { new: true });
        if (!updated) return res.status(404).json({ message: "Instructure not found." });
        return res.json(updated);
    } catch (err) {
        console.error("updateInstructure error:", err);
        return res.status(500).json({ message: "Failed to update instructure." });
    }
};

exports.deleteInstructure = async (req, res) => {
    try {
        const deleted = await Instructure.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ message: "Instructure not found." });
        return res.json({ ok: true });
    } catch (err) {
        console.error("deleteInstructure error:", err);
        return res.status(500).json({ message: "Failed to delete instructure." });
    }
};

// ADD: Start OTP (send code to provided email)
exports.startInstructorEmailOtp = async (req, res) => {
    try {
        const { email } = req.body || {};
        if (!email) return res.status(400).json({ message: "Email is required." });

        const code = issueOtp(email);
        const subject = "SkillNaav — Verify your email (OTP)";
        const bodyHtml = `
      <div style="font-family:Arial,sans-serif;line-height:1.6">
        <h2>Verify your email</h2>
        <p>Your 6-digit code:</p>
        <p style="font-size:24px;font-weight:700;letter-spacing:2px">${code}</p>
        <p>This code expires in ${process.env.OTP_TTL_MIN || 10} minutes.</p>
      </div>
    `;
        await notifyUser(email, subject, bodyHtml);

        return res.json({ ok: true });
    } catch (err) {
        console.error("startInstructorEmailOtp error:", err);
        return res.status(500).json({ message: "Failed to start OTP." });
    }
};

// ADD: Verify OTP
exports.verifyInstructorEmailOtp = async (req, res) => {
    try {
        const { email, otp } = req.body || {};
        if (!email || !otp) return res.status(400).json({ message: "Email and OTP are required." });

        const ok = verifyOtp(email, otp);
        if (!ok) return res.status(400).json({ message: "Invalid or expired OTP." });

        return res.json({ ok: true });
    } catch (err) {
        console.error("verifyInstructorEmailOtp error:", err);
        return res.status(500).json({ message: "Failed to verify OTP." });
    }
};