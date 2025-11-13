/*  backend/services/ragHelpers.js
 *  --------------------------------------------------------------
 *  Light-weight “Retrieve” helpers for our RAG pipeline.
 *  Pulls distinct company names, internship types, and modes
 *  from the InternshipPosting collection (MongoDB).
 */

const Internship = require("../models/webapp-models/internshipPostModel");

/* --- distinct companies, newest first -------------------------------- */
async function listCompanies(limit = 40) {
  const rows = await Internship.aggregate([
    { $match: { adminApproved: true, deleted: false } },
    { $sort:  { createdAt: -1 } },       // needs timestamps:true (see Note 4)
    { $group: { _id: "$companyName" } },
    { $limit: limit },
  ]);
  return rows.map((r) => r._id.trim()).filter(Boolean);
}

/* --- internship types (FREE | STIPEND | PAID) ------------------------- */
async function listTypes() {
  return await Internship.distinct("internshipType", {
    adminApproved: true,
    deleted: false,
  });
}

/* --- internship modes (ONLINE | OFFLINE | HYBRID) --------------------- */
async function listModes() {
  return await Internship.distinct("internshipMode", {
    adminApproved: true,
    deleted: false,
  });
}

module.exports = { listCompanies, listTypes, listModes };
