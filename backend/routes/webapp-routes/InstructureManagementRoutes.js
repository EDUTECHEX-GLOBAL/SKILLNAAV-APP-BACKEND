// backend/routes/webapp-routes/instructureManagementRoutes.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const {
    createInstructure,
    listInstructures,
    getInstructure,
    updateInstructure,
    deleteInstructure,
    // ADD:
    startInstructorEmailOtp,
    verifyInstructorEmailOtp,
} = require("../../controllers/InstructureManagementController");

const router = express.Router();

// ensure uploads dir exists
const uploadDir = path.join(__dirname, "..", "..", "uploads", "instructors");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        cb(null, `${Date.now()}-${safe}`);
    },
});

const upload = multer({
    storage,
    limits: { files: 25, fileSize: 25 * 1024 * 1024 },
});

const fields = upload.fields([
    { name: "payload", maxCount: 1 },    // supports Blob JSON payload
    { name: "resume", maxCount: 1 },
    { name: "photo", maxCount: 1 },
    { name: "certificates", maxCount: 20 },
]);

// OTP endpoints first (optional but future-proof)
router.post("/otp/start", startInstructorEmailOtp);
router.post("/otp/verify", verifyInstructorEmailOtp);

// Core CRUD
router.post("/", fields, createInstructure);
router.get("/", listInstructures);
router.get("/:id", getInstructure);
router.put("/:id", fields, updateInstructure);
router.delete("/:id", deleteInstructure);

module.exports = router;