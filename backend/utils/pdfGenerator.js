const PDFDocument = require("pdfkit");
const moment = require("moment");
const axios = require("axios");

const generateOfferPDFBuffer = async (offerData) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 0, size: "A4" });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageW = doc.page.width;
      const pageH = doc.page.height;

      // Visual defaults
      const brandBlue = offerData.template?.brandColor ?? "#1d4ed8";
      const bgFill = "#f6f8fb";
      const textColor = "#111827";
      const cardMargin = 56;
      const cardX = cardMargin;
      const cardY = cardMargin;
      const cardW = pageW - cardMargin * 2;
      const cardH = pageH - cardMargin * 2;

      // Background (optional)
      let bgBuffer = null;
      if (offerData.template?.backgroundImageUrl) {
        try {
          const resp = await axios.get(offerData.template.backgroundImageUrl, { responseType: "arraybuffer", timeout: 6000 });
          bgBuffer = Buffer.from(resp.data, "binary");
        } catch (e) { bgBuffer = null; }
      }
      if (bgBuffer) {
        try {
          doc.image(bgBuffer, 0, 0, { width: pageW, height: pageH });
          doc.save(); doc.rect(0, 0, pageW, pageH).fillOpacity(0.5).fill("#ffffff"); doc.restore();
        } catch (e) { doc.rect(0, 0, pageW, pageH).fill(bgFill); }
      } else {
        doc.rect(0, 0, pageW, pageH).fill(bgFill);
      }

      // Card + shadow
      doc.save(); doc.roundedRect(cardX + 6, cardY + 8, cardW, cardH, 8).fillOpacity(0.06).fill("#000000"); doc.restore();
      doc.save(); doc.roundedRect(cardX, cardY, cardW, cardH, 8).fill("#ffffff").strokeOpacity(0.12).lineWidth(1).stroke("#d1d5db"); doc.restore();

      // Inner padding and sizes
      const pad = 28;
      const innerX = cardX + pad;
      const innerY = cardY + pad;
      const innerW = cardW - pad * 2;
      const innerH = cardH - pad * 2;

      // Logo (optional)
      if (offerData.template?.logoUrl) {
        try {
          const logoResp = await axios.get(offerData.template.logoUrl, { responseType: "arraybuffer", timeout: 6000 });
          const logoBuf = Buffer.from(logoResp.data, "binary");
          doc.image(logoBuf, innerX, innerY - 4, { fit: [110, 40], align: "left" });
        } catch (e) { /* ignore logo load error */ }
      }

      // Signature block reserved area (strict)
      const signatureHeight = 120; // reserve this much for signature and contact
      const usableHeight = innerH - signatureHeight - 12;

      // Prepare display arrays (we may truncate if needed)
      let responsibilities = (offerData.jobDescription || "").split("\n").map(s => s.trim()).filter(Boolean);
      let qualifications = (offerData.qualifications || []).slice();

      // Measurement helper
      const minFont = 9;
      let baseFont = offerData.template?.textStyle?.fontSize ?? 11.5;

      const measureContentHeight = (fontSize, respArr, qualArr) => {
        doc.font("Helvetica").fontSize(fontSize);
        let y = 0;
        // date
        y += doc.heightOfString(`Date: ${moment().format("MMMM D, YYYY")}`, { width: innerW }) + 8;
        // to and email
        y += doc.heightOfString(`To: ${offerData.name || ""}`, { width: innerW }) + 4;
        if (offerData.email) y += doc.heightOfString(`Email: ${offerData.email}`, { width: innerW }) + 8;
        // title
        doc.font("Helvetica-Bold").fontSize(Math.round(fontSize * 1.18));
        y += doc.heightOfString(`OFFER LETTER – ${offerData.position || ""}`, { width: innerW }) + 10;
        // intro
        doc.font("Helvetica").fontSize(fontSize);
        const intro = `Dear ${offerData.name || "Candidate"},\n\nWe are delighted to offer you the position of ${offerData.position || "—"} at ${offerData.companyName || "—"}. Your internship is scheduled to commence on ${offerData.startDate ? moment(offerData.startDate).format("MMMM D, YYYY") : "TBD"}.`;
        y += doc.heightOfString(intro, { width: innerW, lineGap: 4 }) + 10;

        // helper for sections
        const pushSection = (title, lines) => {
          doc.font("Helvetica-Bold").fontSize(Math.round(fontSize * 1.02));
          y += doc.heightOfString(title.toUpperCase(), { width: innerW }) + 6;
          doc.font("Helvetica").fontSize(fontSize);
          lines.forEach((ln) => { y += doc.heightOfString(`• ${ln}`, { width: innerW - 20 }) + 4; });
          y += 6;
        };

        pushSection("Position Details", [
          `Job Title: ${offerData.position || "—"}`,
          `Reporting Manager: ${offerData.contactInfo?.name || "To be assigned"}`,
          `Location: ${offerData.location || "—"}`,
          `Start Date: ${offerData.startDate ? moment(offerData.startDate).format("MMMM D, YYYY") : "—"}`,
          `Duration: ${offerData.duration || "—"}`
        ]);

        // Compensation
        const compLines = [];
        if (offerData.internshipType === "STIPEND") {
          const c = offerData.compensationDetails || {};
          compLines.push(`${c.amount ?? "—"} ${c.currency ?? ""} ${c.frequency ? `per ${c.frequency.toLowerCase()}` : ""}`);
          if (c.benefits && c.benefits.length) compLines.push(`Benefits: ${c.benefits.join(", ")}`);
        } else if (offerData.internshipType === "PAID") compLines.push("This is a paid internship.");
        else compLines.push("This is an unpaid internship.");
        pushSection("Compensation Details", compLines);

        if (respArr.length) pushSection("Key Responsibilities", respArr);
        if (qualArr.length) pushSection("Required Qualifications", qualArr);

        // terms
        pushSection("Terms and Conditions", [
          "This offer is contingent upon successful completion of any pre-internship requirements.",
          "Interns are expected to adhere to all company policies.",
          `The internship may be terminated by either party with ${offerData.noticePeriod || "2 weeks"} notice.`
        ]);

        // acceptance
        y += doc.heightOfString(`Please sign and return this offer letter by ${moment().add(7, "days").format("MMMM D, YYYY")} to confirm your acceptance.`, { width: innerW }) + 12;
        return y;
      };

      // Try shrinking font to fit. If cannot fit at minFont, truncate long lists progressively.
      let measured = measureContentHeight(baseFont, responsibilities, qualifications);
      while (measured > usableHeight && baseFont > minFont) {
        baseFont -= 0.5;
        measured = measureContentHeight(baseFont, responsibilities, qualifications);
      }

      // If still doesn't fit, truncate lists (start reducing responsibilities then qualifications)
      let respLimit = responsibilities.length;
      let qualLimit = qualifications.length;
      while (measured > usableHeight && (respLimit > 2 || qualLimit > 1)) {
        if (respLimit > 2) respLimit = Math.max(2, respLimit - 2);
        else if (qualLimit > 1) qualLimit = Math.max(1, qualLimit - 1);
        responsibilities = responsibilities.slice(0, respLimit);
        qualifications = qualifications.slice(0, qualLimit);
        // add indicator lines to remind user there's more
        if (respLimit < (offerData.jobDescription || "").split("\n").filter(Boolean).length) responsibilities.push("...see full description in portal");
        if (qualLimit < (offerData.qualifications || []).length) qualifications.push("...see full description in portal");
        measured = measureContentHeight(baseFont, responsibilities, qualifications);
      }

      // Final font
      const finalFont = Math.max(baseFont, minFont);
      const headingFont = Math.round(finalFont * 1.18);

      // Now render content (strict signature Y)
      let cursorY = innerY;

      // DATE right aligned
      doc.font("Helvetica").fontSize(finalFont).fillColor("#6b7280")
         .text(`Date: ${moment().format("MMMM D, YYYY")}`, innerX, cursorY, { width: innerW, align: "right" });
      cursorY += doc.heightOfString("Date", { width: innerW }) + 8;

      // To / email
      doc.font("Helvetica-Bold").fontSize(finalFont).fillColor(textColor).text(`To: ${offerData.name || ""}`, innerX, cursorY, { width: innerW });
      cursorY += doc.heightOfString(`To: ${offerData.name || ""}`, { width: innerW }) + 4;
      if (offerData.email) {
        doc.font("Helvetica").fontSize(Math.max(finalFont - 0.5, 9)).fillColor("#374151").text(`Email: ${offerData.email}`, innerX, cursorY, { width: innerW });
        cursorY += doc.heightOfString(`Email: ${offerData.email}`, { width: innerW }) + 10;
      } else cursorY += 6;

      // Divider
      doc.save(); doc.moveTo(innerX, cursorY).lineTo(innerX + innerW, cursorY).lineWidth(0.7).strokeOpacity(0.12).stroke("#9ca3af"); doc.restore();
      cursorY += 12;

      // Title
      doc.font("Helvetica-Bold").fontSize(headingFont).fillColor(brandBlue)
         .text(`OFFER LETTER – ${String(offerData.position || "").toUpperCase()}`, innerX, cursorY, { width: innerW });
      cursorY += doc.heightOfString(`OFFER LETTER – ${offerData.position}`, { width: innerW }) + 10;

      // Intro
      doc.font("Helvetica").fontSize(finalFont).fillColor(textColor);
      const intro = `Dear ${offerData.name || "Candidate"},\n\nWe are delighted to offer you the position of ${offerData.position || "—"} at ${offerData.companyName || "—"}. Your internship is scheduled to commence on ${offerData.startDate ? moment(offerData.startDate).format("MMMM D, YYYY") : "TBD"}.`;
      doc.text(intro, innerX, cursorY, { width: innerW, lineGap: 4 });
      cursorY += doc.heightOfString(intro, { width: innerW }) + 10;

      // Section renderer
      const drawSection = (title, lines) => {
        doc.font("Helvetica-Bold").fontSize(Math.round(finalFont * 1.02)).fillColor(brandBlue).text(title.toUpperCase(), innerX, cursorY, { width: innerW });
        cursorY += doc.heightOfString(title, { width: innerW }) + 6;
        doc.font("Helvetica").fontSize(finalFont).fillColor(textColor);
        lines.forEach((ln) => {
          doc.text(`• ${ln}`, innerX + 8, cursorY, { width: innerW - 20, lineGap: 2 });
          cursorY += doc.heightOfString(`• ${ln}`, { width: innerW - 20 }) + 4;
        });
        cursorY += 6;
      };

      // Position details
      drawSection("Position Details", [
        `Job Title: ${offerData.position || "—"}`,
        `Reporting Manager: ${offerData.contactInfo?.name || "To be assigned"}`,
        `Location: ${offerData.location || "—"}`,
        `Start Date: ${offerData.startDate ? moment(offerData.startDate).format("MMMM D, YYYY") : "—"}`,
        `Duration: ${offerData.duration || "—"}`
      ]);

      // Compensation
      const compLines = [];
      if (offerData.internshipType === "STIPEND") {
        const c = offerData.compensationDetails || {};
        compLines.push(`${c.amount ?? "—"} ${c.currency ?? ""} ${c.frequency ? `per ${c.frequency.toLowerCase()}` : ""}`);
        if (c.benefits && c.benefits.length) compLines.push(`Benefits: ${c.benefits.join(", ")}`);
      } else if (offerData.internshipType === "PAID") compLines.push("This is a paid internship.");
      else compLines.push("This is an unpaid internship.");
      drawSection("Compensation Details", compLines);

      // Responsibilities (possibly truncated)
      if (responsibilities.length) drawSection("Key Responsibilities", responsibilities);

      // Qualifications (possibly truncated)
      if (qualifications.length) drawSection("Required Qualifications", qualifications);

      // Terms
      drawSection("Terms and Conditions", [
        "This offer is contingent upon successful completion of any pre-internship requirements.",
        "Interns are expected to adhere to all company policies.",
        `The internship may be terminated by either party with ${offerData.noticePeriod || "2 weeks"} notice.`
      ]);

      // Acceptance block (will be above signature area)
      const acceptanceLine = `Please sign and return this offer letter by ${moment().add(7, "days").format("MMMM D, YYYY")} to confirm your acceptance.`;
      doc.font("Helvetica-Bold").fontSize(Math.round(finalFont)).fillColor(brandBlue).text("ACCEPTANCE", innerX, cursorY);
      cursorY += doc.heightOfString("ACCEPTANCE", { width: innerW }) + 6;
      doc.font("Helvetica").fontSize(finalFont).fillColor(textColor).text(acceptanceLine, innerX, cursorY, { width: innerW, lineGap: 4 });
      cursorY += doc.heightOfString(acceptanceLine, { width: innerW }) + 12;

      // Strict signature placement (never overlap above content)
      const signX = innerX;
      const signY = innerY + innerH - signatureHeight + 10;

      // If cursorY is dangerously close to signature area, add small spacer or move acceptance slightly up
      if (cursorY > signY - 20) {
        // add a small divider to visually separate
        doc.save();
        doc.moveTo(innerX, signY - 30).lineTo(innerX + innerW, signY - 30).lineWidth(0.6).strokeOpacity(0.08).stroke("#9ca3af");
        doc.restore();
      }

      // Signature block
      doc.font("Helvetica").fontSize(finalFont).fillColor(textColor).text("We look forward to welcoming you aboard!", innerX, signY - 64, { width: innerW });
      doc.font("Helvetica").text("Sincerely,", innerX, signY - 48);
      doc.moveTo(innerX, signY - 16).lineTo(innerX + 180, signY - 16).lineWidth(0.9).strokeOpacity(0.14).stroke("#374151");
      doc.font("Helvetica-Bold").text(offerData.contactInfo?.name || "HR Manager", innerX, signY);
      doc.font("Helvetica").fontSize(Math.max(finalFont - 0.5, 9)).fillColor("#6b7280").text(offerData.companyName || "", innerX, signY + 18);
      if (offerData.contactInfo?.email || offerData.contactInfo?.phone) {
        const contactText = `${offerData.contactInfo?.email || ""}${offerData.contactInfo?.email && offerData.contactInfo?.phone ? " | " : ""}${offerData.contactInfo?.phone || ""}`;
        doc.font("Helvetica").fontSize(Math.max(finalFont - 2, 8)).fillColor("#6b7280").text(contactText, innerX, signY + 36);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = generateOfferPDFBuffer;
