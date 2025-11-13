// controllers/offerTemplateController.js
const OfferTemplate = require("../models/webapp-models/OfferTemplateModel");

// GET: Fetch templates for a partner
exports.getTemplatesByPartner = async (req, res) => {
  try {
    const { partnerId } = req.query;

    if (!partnerId) {
      return res.status(400).json({ error: "partnerId is required" });
    }

    const templates = await OfferTemplate.find({ partnerId }).sort({ createdAt: -1 });
    res.status(200).json(templates);
  } catch (err) {
    console.error("Error fetching templates:", err);
    res.status(500).json({ error: "Failed to fetch templates" });
  }
};

// POST: Create a new template
exports.createTemplate = async (req, res) => {
  try {
    const { partnerId, name, backgroundImageUrl, textStyle } = req.body;

    if (!partnerId) {
      return res.status(400).json({ error: "partnerId is required" });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Template name is required." });
    }

    if (!backgroundImageUrl) {
      return res.status(400).json({ error: "Please upload a background image." });
    }

   const template = await OfferTemplate.create({
  partnerId,
  name: name.trim(), // ✅ ensure this is passed from frontend
  title: name.trim(), // ✅ also set the title if needed
  backgroundImageUrl,
  textStyle: {
    fontSize: textStyle?.fontSize || 12,
    fontColor: textStyle?.fontColor || "#000000",
    marginTop: textStyle?.marginTop || 100,
    marginLeft: textStyle?.marginLeft || 50,
  },
});


    res.status(201).json(template);
  } catch (err) {
    console.error("Error creating template:", err);
    res.status(500).json({ error: "Failed to create template" });
  }
};



// DELETE: Delete a template
exports.deleteTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    await OfferTemplate.findByIdAndDelete(templateId);
    res.status(200).json({ message: "Template deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST: Upload background image
exports.uploadImage = async (req, res) => {
  if (!req.file || !req.file.location) {
    return res.status(400).json({ error: "Image upload failed" });
  }

  res.status(200).json({ imageUrl: req.file.location });
};
