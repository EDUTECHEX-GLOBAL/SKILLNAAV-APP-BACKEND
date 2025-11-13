const PDFDocument = require("pdfkit");
const moment = require("moment");
const axios = require("axios");

const generateOfferPDFBuffer = async (offerData) => {
  return new Promise(async (resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: "A4" });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    const blue = "#1d4ed8";

    // Styling helper
    const sectionTitleStyle = () => {
      doc.fillColor(blue).fontSize(12).font("Helvetica-Bold");
    };

    // Load background image
    let backgroundBuffer = null;
    if (offerData.template?.backgroundImageUrl) {
      try {
        const response = await axios.get(offerData.template.backgroundImageUrl, {
          responseType: "arraybuffer",
        });
        backgroundBuffer = Buffer.from(response.data, "binary");
      } catch (err) {
        console.error("❌ Background image error:", err.message);
      }
    }

    // Draw background
    const drawBackground = () => {
      if (backgroundBuffer) {
        try {
          doc.image(backgroundBuffer, 0, 0, {
            width: pageWidth,
            height: pageHeight,
          });
        } catch (err) {
          console.error("❌ Draw background error:", err.message);
        }
      }
    };

    doc.on("pageAdded", drawBackground);
    drawBackground();

    // Safe text boundaries
    const marginX = offerData.template?.textStyle?.marginLeft ?? 50;
    const marginY = offerData.template?.textStyle?.marginTop ?? 100;
    const contentWidth = pageWidth - marginX * 2;

    doc.fontSize(offerData.template?.textStyle?.fontSize ?? 12)
       .fillColor(offerData.template?.textStyle?.fontColor ?? "#000000")
       .font("Helvetica");

    const addSpace = (lines = 1) => doc.moveDown(lines);

    // --- HEADER SECTION ---
    doc
      .fillColor("gray")
      .fontSize(10)
      .text(`Date: ${moment().format("MMMM D, YYYY")}`, marginX, marginY, { width: contentWidth, align: "right" });

    addSpace(2);

    // --- TO SECTION ---
    doc.fillColor("black").fontSize(12)
      .text(`To: ${offerData.name}`, marginX)
      .text(`Email: ${offerData.email}`);
    addSpace(1);

    // --- TITLE ---
    doc
      .fontSize(16)
      .fillColor(blue)
      .font("Helvetica-Bold")
      .text(`OFFER LETTER – ${offerData.position?.toUpperCase()}`, { underline: true });
    addSpace(1);

    doc
      .font("Helvetica")
      .fillColor("black")
      .fontSize(12)
      .text(`Dear ${offerData.name},`)
      .moveDown(0.5)
      .text(`We are delighted to offer you the position of ${offerData.position} at ${offerData.companyName}. Your internship is scheduled to commence on ${moment(offerData.startDate).format("MMMM D, YYYY")}.`, {
        align: "justify",
        width: contentWidth,
      });

    addSpace(1);

    // --- POSITION DETAILS ---
    sectionTitleStyle();
    doc.text("POSITION DETAILS").moveDown(0.3);
    doc.font("Helvetica").fillColor("black");
    doc.text(`• Job Title: ${offerData.position}`, { indent: 30 });
    doc.text(`• Reporting Manager: ${offerData.contactInfo?.name || "To be assigned"}`, { indent: 30 });
    doc.text(`• Location: ${offerData.location}`, { indent: 30 });
    doc.text(`• Start Date: ${moment(offerData.startDate).format("MMMM D, YYYY")}`, { indent: 30 });
    doc.text(`• Duration: ${offerData.duration}`, { indent: 30 });

    addSpace(1);

    // --- COMPENSATION DETAILS ---
    sectionTitleStyle();
    doc.text("COMPENSATION DETAILS").moveDown(0.3);
    doc.font("Helvetica").fillColor("black");

    const comp = offerData.compensationDetails;
    if (offerData.internshipType === "STIPEND") {
      doc.text(`• Stipend: ${comp.amount} ${comp.currency} per ${comp.frequency.toLowerCase()}`, { indent: 30 });
      if (comp.benefits?.length > 0) {
        doc.text(`• Additional Benefits:`, { indent: 30 });
        comp.benefits.forEach((b) => doc.text(`  - ${b}`, { indent: 45 }));
      }
    } else if (offerData.internshipType === "PAID") {
      doc.text(`• This is a paid internship.`, { indent: 30 });
      comp.additionalCosts?.forEach((cost) => {
        doc.text(`  - ${cost.description}: ${cost.amount} ${cost.currency}`, { indent: 45 });
      });
    } else {
      doc.text(`• This is an unpaid internship.`, { indent: 30 });
    }

    addSpace(1);

    // --- RESPONSIBILITIES ---
    if (offerData.jobDescription) {
      sectionTitleStyle();
      doc.text("KEY RESPONSIBILITIES").moveDown(0.3);
      doc.font("Helvetica").fillColor("black");
      offerData.jobDescription.split("\n").forEach((item) => {
        if (item.trim()) doc.text(`• ${item.trim()}`, { indent: 30 });
      });
      addSpace(1);
    }

    // --- QUALIFICATIONS ---
    if (offerData.qualifications?.length) {
      sectionTitleStyle();
      doc.text("REQUIRED QUALIFICATIONS").moveDown(0.3);
      doc.font("Helvetica").fillColor("black");
      offerData.qualifications.forEach((q) => {
        doc.text(`• ${q}`, { indent: 30 });
      });
      addSpace(1);
    }

    // --- TERMS ---
    sectionTitleStyle();
    doc.text("TERMS AND CONDITIONS").moveDown(0.3);
    doc.font("Helvetica").fillColor("black")
      .text(`1. This offer is contingent upon successful completion of any pre-internship requirements.`, { indent: 30 })
      .text(`2. Interns are expected to adhere to all company policies.`, { indent: 30 })
      .text(`3. The internship may be terminated by either party with ${offerData.noticePeriod || "2 weeks"} notice.`, { indent: 30 });

    addSpace(1);

    // --- ACCEPTANCE ---
    sectionTitleStyle();
    doc.text("ACCEPTANCE").moveDown(0.3);
    doc.font("Helvetica").fillColor("black")
      .text(`Please sign and return this offer letter by ${moment().add(7, "days").format("MMMM D, YYYY")} to confirm your acceptance.`)
      .moveDown(2)
      .text(`We look forward to welcoming you aboard!`)
      .moveDown(3)
      .text(`Sincerely,`)
      .moveDown()
      .text(`___________________________`)
      .text(offerData.contactInfo?.name || "HR Manager")
      .text(offerData.companyName)
      .text(`Email: ${offerData.contactInfo?.email || "hr@example.com"}`)
      .text(`Phone: ${offerData.contactInfo?.phone || ""}`);

    doc.end();
  });
};

module.exports = generateOfferPDFBuffer;
