// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import formidable from "formidable";
import fs from "fs";

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: "20mb" })); // allow large images

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ===== First-aid rules =====
const rules = {
  burn: [
    "Cool the burn under running water for 10-20 minutes",
    "Cover with a sterile, non-stick dressing",
    "Do NOT apply butter or toothpaste",
    "Seek medical help if severe or blistered",
  ],
  cut: [
    "Clean the wound with water",
    "Apply antiseptic",
    "Cover with a clean bandage",
    "Seek medical attention if deep or bleeding persists",
  ],
  bleeding: [
    "Apply firm pressure with a clean cloth",
    "Elevate the affected limb if possible",
    "Keep pressure until bleeding stops",
    "Seek emergency care if heavy bleeding",
  ],
};

// ===== Dynamic mock fallback =====
function randomMock() {
  const injuries = ["burn", "cut", "bleeding"];
  const injury = injuries[Math.floor(Math.random() * injuries.length)];
  const confidence = Math.floor(70 + Math.random() * 25) + "%";

  return {
    mock: true,
    injury,
    confidence,
    steps: rules[injury],
    disclaimer: "Mock response used. This does not replace professional medical care.",
  };
}

// ===== Analyze endpoint =====
app.post("/api/analyze", async (req, res) => {
  // Support both JSON body (imageBase64) and multipart/form-data uploads.
  let imageBase64;
  const contentType = req.headers["content-type"] || "";

  if (contentType.startsWith("multipart/form-data")) {
    // Parse file upload using formidable
    const form = new formidable.IncomingForm({
      keepExtensions: true,
      maxFileSize: 5 * 1024 * 1024,
      filter: ({ mimetype }) => ["image/jpeg", "image/png", "image/webp"].includes(mimetype || ""),
    });

    const parseResult = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        resolve({ fields, files });
      });
    });

    const file = parseResult.files?.image || parseResult.files?.file;
    if (!file) {
      return res.status(400).json({ error: "No image provided" });
    }

    const filePath = file.filepath || file.path;

    try {
      const buffer = fs.readFileSync(filePath);
      imageBase64 = buffer.toString("base64");
    } catch (err) {
      console.error("Failed to read uploaded file:", err);
      return res.status(500).json({ error: "Failed to read uploaded image" });
    }
  } else {
    // Fallback: accept JSON body with imageBase64 field
    imageBase64 = req.body?.imageBase64;
  }

  if (!imageBase64) {
    return res.status(400).json({ error: "No image provided" });
  }

  if (!GEMINI_API_KEY) {
    console.warn("No API key found - using mock response");
    return res.json(randomMock());
  }

  try {
    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: "image/png",
                    data: imageBase64,
                  },
                },
                {
                  text: `You are a medical AI assistant.
Analyze this injury image.
Classify it as burn, cut, or bleeding.
Provide a confidence percentage.
Then give step-by-step first aid instructions.`,
                },
              ],
            },
          ],
        }),
      }
    );

    if (!geminiResponse.ok) {
      console.error(`Gemini API returned HTTP ${geminiResponse.status}`);
      return res.status(502).json({
        error: "AI service returned an error. Please try again later.",
        fallback: randomMock(),
      });
    }

    const rawText = await geminiResponse.text();

    let aiText = "";

    try {
      const data = JSON.parse(rawText);
      aiText =
        data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } catch (err) {
      console.error("Failed to parse Gemini response as JSON:", err.message, "Raw:", rawText.slice(0, 200));
      return res.status(502).json({
        error: "Could not parse AI response. Please try again.",
        fallback: randomMock(),
      });
    }

    // ===== Flexible extraction =====
    let injury = "unknown";
    let confidence = "N/A";

    const injuryMatch = aiText.match(/\b(burn|cut|bleeding)\b/i);
    if (injuryMatch) injury = injuryMatch[1].toLowerCase();

    const confidenceMatch = aiText.match(/(\d{1,3})\s*%/);
    if (confidenceMatch) confidence = confidenceMatch[1] + "%";

    if (!rules[injury]) {
      console.warn("AI returned unrecognized injury type:", injury);
      return res.status(200).json({
        mock: true,
        warning: "AI returned an unrecognized injury type. Showing general guidance.",
        ...randomMock(),
      });
    }

    // ✅ Send real structured result
    res.json({
      mock: false,
      injury,
      confidence,
      steps: rules[injury],
      disclaimer: "This does not replace professional medical care.",
    });
  } catch (err) {
    console.error("Gemini API error:", err.message || err);
    res.status(502).json({
      error: "AI analysis failed. Please try again later.",
      fallback: randomMock(),
    });
  }
});

// ===== Test endpoint =====
app.get("/api/test", (req, res) => {
  res.json({ success: true, message: "Backend running with Gemini Vision" });
});

// ===== Start server =====
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
