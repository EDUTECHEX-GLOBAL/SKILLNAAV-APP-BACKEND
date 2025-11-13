const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const InternshipAssessment = require("../models/webapp-models/InternshipAssessmentModel");
const InternshipPosting = require("../models/webapp-models/internshipPostModel");
const AssessmentSubmission = require("../models/webapp-models/AssessmentSubmissionModel");
const mongoose = require('mongoose');
function toObjectId(id) {
  return new mongoose.Types.ObjectId(id);  // ✅ CORRECT
}



const bedrockClient = new BedrockRuntimeClient({
  region: process.env.ASSESSMENT_AWS_REGION || process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.ASSESSMENT_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.ASSESSMENT_AWS_SECRET_ACCESS_KEY,
  },
});

// Generate AI Assessment
exports.generateAIInternshipAssessment = async (req, res) => {
  try {
    const { internshipId, studentId } = req.body;
    if (!internshipId || !studentId) {
      return res.status(400).json({ message: "internshipId and studentId are required" });
    }

    const internship = await InternshipPosting.findById(internshipId);
    if (!internship) return res.status(404).json({ message: "Internship not found" });

    const existing = await InternshipAssessment.findOne({ internshipId, studentId });
    if (existing) {
      return res.status(200).json({ message: "Assessment already exists", assessment: existing });
    }

    const prompt = `
You are an intelligent assessment generator for internship applicants.

Create exactly 5 multiple-choice questions (MCQs) to test readiness for the internship.

Internship Title: ${internship.jobTitle}
Company: ${internship.companyName}
Required Skills: ${internship.qualifications?.join(", ") || "N/A"}
Internship Description: ${internship.jobDescription || "N/A"}

Return ONLY a valid JSON array with this format:
[
  {
    "questionText": "string",
    "options": ["option1", "option2", "option3", "option4"],
    "correctAnswer": 1,
    "marks": 1,
    "type": "mcq"
  }
]
`;

    const modelId = process.env.BEDROCK_MODEL_ID || "meta.llama3-8b-instruct-v1:0";
    const command = new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({ prompt, temperature: 0.6, max_gen_len: 800 }),
    });

    const response = await bedrockClient.send(command);
    const rawOutput = JSON.parse(Buffer.from(response.body).toString("utf-8"));
    const modelText = rawOutput?.output_text || rawOutput?.generation || "";

    let questions = [];
    try {
      const match = modelText.match(/\[\s*{[\s\S]*?}\s*\]/);
      if (!match) throw new Error("No valid JSON array found in AI output");

      questions = JSON.parse(match[0]).map((q) => ({ ...q, fromAI: true }));
      questions = questions.filter(q => 
        typeof q.questionText === 'string' &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        q.options.every(opt => typeof opt === 'string')
      );

      if (questions.length !== 5) throw new Error("AI did not return exactly 5 valid MCQs");
    } catch (err) {
      console.error("⚠️ Error parsing AI JSON:", modelText);
      return res.status(500).json({ message: "AI response invalid JSON format" });
    }

    const totalMarks = questions.reduce((sum, q) => sum + (q.marks || 1), 0);

    const assessment = await InternshipAssessment.create({
      internshipId,
      studentId,
      questions,
      totalMarks,
      aiPromptUsed: prompt,
    });

    res.status(201).json({ message: "AI Assessment generated successfully", assessment });

  } catch (error) {
    console.error("❌ Error generating AI assessment:", error);
    res.status(500).json({ message: "Failed to generate assessment", error: error.message });
  }
};

// Get Assessment for Student
exports.getStudentAssessment = async (req, res) => {
  try {
    const { studentId, internshipId } = req.params;
    if (!studentId || !internshipId) return res.status(400).json({ message: "studentId and internshipId are required" });

    const assessment = await InternshipAssessment.findOne({ studentId, internshipId });
    if (!assessment) return res.status(404).json({ message: "Assessment not found" });

    res.status(200).json({ assessment });
  } catch (error) {
    console.error("❌ Error fetching assessment:", error);
    res.status(500).json({ message: "Failed to fetch assessment", error: error.message });
  }
};

// Submit Assessment
exports.submitAssessment = async (req, res) => {
  try {
    const { 
      studentId, 
      assessmentId, 
      responses, 
      timeTaken,
      violations = [],
      violationCount = 0,
      proctoringData = {},
      isAutoSubmit = false
    } = req.body;

    if (!studentId || !assessmentId || !responses) {
      return res.status(400).json({ 
        message: "studentId, assessmentId, and responses are required" 
      });
    }

    // Check if already submitted
    const existingSubmission = await AssessmentSubmission.findOne({
      studentId,
      assessmentId
    });

    if (existingSubmission) {
      return res.status(400).json({ 
        message: "Assessment already submitted",
        submission: existingSubmission
      });
    }

    // Calculate score & percentage
    let score = 0;
    let totalMarks = 0;
    
    const processedResponses = responses.map(r => {
      const isCorrect = r.studentAnswer === r.correctAnswer;
      const marks = r.marks || 1;
      
      if (isCorrect) {
        score += marks;
      }
      
      totalMarks += marks;

      return {
        ...r,
        isCorrect,
        marks
      };
    });

    const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;
    
    // Determine fit status based on percentage and violations
    let fitStatus = "not fit";
    if (percentage >= 60) {
      // If too many violations, mark as not fit even if score is good
      if (violationCount < 5) {
        fitStatus = "fit";
      } else {
        fitStatus = "not fit"; // Failed due to excessive violations
      }
    }

    // Process violations to add severity
    const processedViolations = violations.map(v => ({
      ...v,
      severity: v.type === 'TAB_SWITCH' || v.type === 'FULLSCREEN_EXIT' 
        ? 'high' 
        : v.type === 'KEYBOARD_ATTEMPT' 
        ? 'medium' 
        : 'low'
    }));

    // Prepare proctoring data
    const finalProctoringData = {
      mode: proctoringData.mode || 'real',
      cameraEnabled: proctoringData.cameraEnabled || false,
      microphoneEnabled: proctoringData.microphoneEnabled || false,
      fullscreenEnabled: proctoringData.fullscreenEnabled || false,
      sessionDuration: timeTaken,
      startedAt: proctoringData.startedAt || new Date(Date.now() - (timeTaken * 1000)),
      completedAt: new Date(),
      wasAutoSubmitted: isAutoSubmit,
      autoSubmitReason: isAutoSubmit 
        ? `Exceeded violation limit (${violationCount} violations)` 
        : null
    };

    const submission = await AssessmentSubmission.create({
      studentId,
      assessmentId,
      responses: processedResponses,
      score,
      totalMarks,
      percentage,
      timeTaken,
      fitStatus,
      violations: processedViolations,
      violationCount,
      proctoringData: finalProctoringData,
      submittedAt: new Date()
    });

    // Populate student and assessment details for response
    await submission.populate('studentId', 'name email');
    await submission.populate('assessmentId', 'internshipId');

    res.status(201).json({ 
      message: "Assessment submitted successfully", 
      submission,
      warnings: violationCount > 0 ? {
        violationCount,
        message: violationCount >= 3 
          ? "⚠️ High violation count detected. This may affect your assessment." 
          : "Minor violations detected."
      } : null
    });

  } catch (error) {
    console.error("❌ Error submitting assessment:", error);
    res.status(500).json({ 
      message: "Failed to submit assessment", 
      error: error.message 
    });
  }
};

// Optional: Add a controller to get submission with violation details
exports.getSubmissionWithViolations = async (req, res) => {
  try {
    const { studentId, assessmentId } = req.params;

    const submission = await AssessmentSubmission.findOne({
      studentId,
      assessmentId
    })
    .populate('studentId', 'name email')
    .populate('assessmentId', 'internshipId');

    if (!submission) {
      return res.status(404).json({ 
        message: "No submission found",
        submission: null
      });
    }

    // Add violation summary
    const violationSummary = {
      total: submission.violationCount,
      byType: submission.violations.reduce((acc, v) => {
        acc[v.type] = (acc[v.type] || 0) + 1;
        return acc;
      }, {}),
      highSeverity: submission.violations.filter(v => v.severity === 'high').length,
      mediumSeverity: submission.violations.filter(v => v.severity === 'medium').length,
      lowSeverity: submission.violations.filter(v => v.severity === 'low').length
    };

    res.status(200).json({ 
      submission,
      violationSummary
    });

  } catch (error) {
    console.error("❌ Error fetching submission:", error);
    res.status(500).json({ 
      message: "Failed to fetch submission", 
      error: error.message 
    });
  }
};


// Get assessment submission for a student
exports.getAssessmentSubmission = async (req, res) => {
  try {
    const { studentId, assessmentId } = req.params;
    if (!studentId || !assessmentId) {
      return res.status(400).json({ message: "studentId and assessmentId are required" });
    }

    const submission = await AssessmentSubmission.findOne({
      studentId: toObjectId(studentId),
      assessmentId: toObjectId(assessmentId),
    });

    if (!submission) return res.status(404).json({ message: "Submission not found" });

    res.status(200).json({ submission });
  } catch (error) {
    console.error("❌ Error fetching submission:", error);
    res.status(500).json({ message: "Failed to fetch submission", error: error.message });
  }
};
