// // utils/recommendationService.js

// const mongoose = require("mongoose");
// const stringSimilarity = require("string-similarity");
// const { SentenceTransformer, util } = require("sentence-transformers");

// const Application = require("../models/webapp-models/applicationModel");
// const Userwebapp = require("../models/webapp-models/userModel");
// const InternshipPosting = require("../models/webapp-models/internshipPostModel");

// const embedder = new SentenceTransformer('all-MiniLM-L6-v2');

// // --- Helpers ---
// const norm = (v) => (v || "").toString().trim().toLowerCase();
// const arr = (v) => Array.isArray(v) ? v : (v ? [v] : []);

// const LEVEL_RANK = { basic: 1, intermediate: 2, advanced: 3 };

// // --- Scoring Function (existing) ---
// function scoreJob(job, signals, student) {
//   let score = 0;

//   const jobSkills = (job.qualifications || []).map(norm);
//   const jobTitle = norm(job.jobTitle);
//   const jobDesc = norm(job.jobDescription || "");
//   const jobCat = norm(job.sector || "");
//   const jobLoc = norm(job.location || "");
//   const workMode = norm(job.internshipMode || "");
//   const jobLevel = LEVEL_RANK[job.classification?.toLowerCase()] || 0;

//   // Skills overlap
//   const skillHits = signals.skills.filter(s => jobSkills.includes(s)).length;
//   score += skillHits * 3;

//   // Role / interest match
//   const roleHit = signals.roles.some(r =>
//     jobTitle.includes(r) || jobCat.includes(r) || jobDesc.includes(r)
//   );
//   if (roleHit) score += 5;

//   // Field of Study / Desired Field boost
//   const fields = [student?.fieldOfStudy, student?.desiredField].map(norm).filter(Boolean);
//   fields.forEach(f => {
//     if (jobTitle.includes(f) || jobDesc.includes(f) || jobCat.includes(f)) {
//       score += 5;
//     } else {
//       const sim = stringSimilarity.findBestMatch(f, [jobTitle, jobDesc, jobCat]);
//       if (sim.bestMatch.rating > 0.6) score += 4;
//     }
//   });

//   // Location preference
//   const locHit = workMode.includes("online") || workMode.includes("remote") ||
//     signals.locations.some(l => jobLoc.includes(l));
//   if (locHit) score += 3;

//   // Classification progression
//   const studentLevel = signals.highestLevel || 1; // assume Basic for freshers
//   if (jobLevel === studentLevel) {
//     score += 3; // same level
//   } else if (jobLevel === studentLevel + 1) {
//     score += 10; // next level encouraged
//   } else if (jobLevel > studentLevel + 1) {
//     score -= 3; // too advanced
//   } else {
//     score -= 1; // below level
//   }

//   return score;
// }

// // --- Helper: embed text ---
// async function embedText(text) {
//   return await embedder.encode(text, { convertToTensor: true });
// }

// // --- Enhanced scoring with embedding similarity ---
// async function scoreJobWithEmbedding(job, signals, studentEmbedding, student) {
//   const baseScore = scoreJob(job, signals, student);

//   const jobText = [job.jobTitle || '', job.jobDescription || '', ...(job.qualifications || [])].join(' ');
//   const jobEmbedding = await embedText(jobText);

//   const simScore = util.cosSim(studentEmbedding, jobEmbedding).item();

//   // Combine scores, weighting semantic similarity (weight adjustable)
//   return baseScore + simScore * 10;
// }

// // --- Derive signals from student profile ---
// async function deriveSignals(student) {
//   const skills = arr(student?.skills).map(norm);
//   const roles = [...arr(student?.desiredRole), ...arr(student?.interests)]
//     .filter(Boolean).map(norm);
//   const locations = [...arr(student?.preferredLocations), arr(student?.city)]
//     .filter(Boolean).map(norm);

//   return { skills, roles, locations };
// }

// // --- Infer from past applications ---
// async function inferFromRecentApplications(studentId) {
//   const last = await Application.find({ studentId, status: "Completed" })
//     .sort({ appliedDate: -1 })
//     .limit(10)
//     .populate("internshipId", "jobTitle qualifications sector location jobDescription internshipMode classification")
//     .lean();

//   if (!last.length) return { skills: [], roles: [], locations: [], highestLevel: 0 };

//   const titles = last.map(a => norm(a?.internshipId?.jobTitle)).filter(Boolean);
//   const skills = last.flatMap(a => arr(a?.internshipId?.qualifications)).map(norm);
//   const roles = last.map(a => norm(a?.internshipId?.sector)).filter(Boolean);
//   const locations = last.map(a => norm(a?.internshipId?.location)).filter(Boolean);
//   const classifications = last.map(a => norm(a?.internshipId?.classification)).filter(Boolean);

//   const highestLevel = classifications.reduce(
//     (max, c) => Math.max(max, LEVEL_RANK[c] || 0),
//     0
//   );

//   return {
//     skills: [...new Set(skills)].slice(0, 10),
//     roles: [...new Set([...titles, ...roles])].slice(0, 10),
//     locations: [...new Set(locations)].slice(0, 5),
//     highestLevel
//   };
// }

// // --- Main Recommendation Function ---
// async function getPersonalizedRecommendations(studentId, limit = 6) {
//   if (!mongoose.Types.ObjectId.isValid(studentId)) return [];

//   const student = await Userwebapp.findById(studentId).lean().catch(() => null);
//   if (!student) return [];

//   let signals = await deriveSignals(student);

//   const inferred = await inferFromRecentApplications(studentId);

//   const highestLevel = inferred.highestLevel || 1;

//   signals = {
//     skills: [...new Set([...signals.skills, ...inferred.skills])],
//     roles: [...new Set([...signals.roles, ...inferred.roles])],
//     locations: [...new Set([...signals.locations, ...inferred.locations])],
//     highestLevel
//   };

//   // Embed student profile text for semantic scoring
//   const studentText = [...signals.skills, ...signals.roles, ...signals.locations].join(' ');
//   const studentEmbedding = await embedText(studentText);

//   // Exclude already applied internships
//   const applied = await Application.find({ studentId }).select("internshipId").lean();
//   const excludeIds = applied.map(a => a.internshipId).filter(Boolean);

//   const baseQuery = {
//     applicationOpen: true,
//     _id: { $nin: excludeIds }
//   };

//   const candidates = await InternshipPosting.find(baseQuery)
//     .select("jobTitle jobDescription qualifications sector location internshipMode classification")
//     .limit(100)
//     .lean();

//   // Score candidates using enhanced scoring
//   const scored = [];
//   for (const job of candidates) {
//     const score = await scoreJobWithEmbedding(job, signals, studentEmbedding, student);
//     scored.push({ ...job, _matchScore: score });
//   }

//   scored.sort((a, b) => b._matchScore - a._matchScore);

//   let finalList = scored.slice(0, limit);

//   if (!finalList.length || (finalList[0]._matchScore || 0) <= 0) {
//     finalList = await InternshipPosting.find({
//       applicationOpen: true,
//       _id: { $nin: excludeIds },
//       classification: { $in: ["Basic", "Intermediate"] }
//     }).sort({ createdAt: -1 }).limit(limit).lean();
//   }

//   return finalList;
// }

// module.exports = { getPersonalizedRecommendations };


// ... (your legacy commented code above for reference)

const axios = require('axios');

// Wrapper to call your Python FastAPI AI backend
async function getPersonalizedRecommendations(studentId, limit = 6) {
  try {
    const res = await axios.get(`http://10.12.80.37:5000/recommendations/${studentId}?limit=${limit}`);
    return res.data.recommendations;
  } catch (err) {
    console.error('[RecommendationService] Python AI backend error:', err.message);
    // Fallback: return empty list (or optionally your old logic)
    return [];
  }
}

module.exports = { getPersonalizedRecommendations };
