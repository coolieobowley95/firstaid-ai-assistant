import formidable from "formidable";
import Groq from "groq-sdk";

export const config = {
  api: {
    bodyParser: false,
  },
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    injury: { type: "string" },
    severity: { type: "string", enum: ["mild", "moderate", "severe"] },
    confidence: { type: "string" },
    steps: { type: "array", items: { type: "string" } },
    call_911: { type: "boolean" },
    disclaimer: { type: "string" },
  },
  required: ["injury", "severity", "confidence", "steps", "call_911", "disclaimer"],
};

const SYSTEM_PROMPT = `You are a first aid assistant for urgent but non-diagnostic guidance.
Return only JSON matching this shape:
{
  "injury": "brief likely injury or situation",
  "severity": "mild | moderate | severe",
  "confidence": "percentage like 85%",
  "steps": ["clear first aid step", "clear first aid step", "clear first aid step"],
  "call_911": true,
  "disclaimer": "This does not replace professional medical care."
}
Prioritize safety. Recommend emergency services for heavy bleeding, breathing issues, burns to face/genitals/hands, suspected fracture, loss of consciousness, poisoning, chest pain, stroke symptoms, severe allergic reaction, or uncertainty with severe symptoms.`;

const FALLBACK_RULES = {
  burn: {
    severity: "moderate",
    steps: [
      "Cool the burn under cool running water for 20 minutes.",
      "Remove tight jewelry or clothing near the burn if it is not stuck to skin.",
      "Cover loosely with a sterile, non-stick dressing.",
      "Seek urgent care for large, deep, chemical, electrical, or blistering burns.",
    ],
  },
  cut: {
    severity: "mild",
    steps: [
      "Wash your hands before touching the wound.",
      "Rinse the cut with clean running water.",
      "Apply gentle pressure with clean gauze if bleeding continues.",
      "Cover with a sterile bandage and seek care if deep, dirty, or gaping.",
    ],
  },
  bleeding: {
    severity: "severe",
    steps: [
      "Apply firm, direct pressure with a clean cloth or gauze.",
      "Keep pressure steady and add more cloth if blood soaks through.",
      "Have the person lie down and elevate the injured area if possible.",
      "Call emergency services if bleeding is heavy, spurting, or does not slow.",
    ],
  },
};

function setCommonHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
}

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function sanitizeText(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function parseMultipart(req) {
  const form = formidable({
    keepExtensions: true,
    maxFileSize: MAX_FILE_SIZE,
    multiples: false,
    filter: ({ mimetype }) => ALLOWED_MIME_TYPES.has(mimetype || ""),
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

async function getRequestPayload(req) {
  const contentType = req.headers["content-type"] || "";

  if (!contentType.startsWith("multipart/form-data")) {
    throw Object.assign(new Error("Expected multipart/form-data"), { statusCode: 415 });
  }

  const { fields, files } = await parseMultipart(req);
  const file = firstValue(files.image || files.file);

  if (!file) {
    throw Object.assign(new Error("Upload an image file."), { statusCode: 400 });
  }

  if (!ALLOWED_MIME_TYPES.has(file.mimetype || "")) {
    throw Object.assign(new Error("Only JPEG, PNG, and WebP images are supported."), {
      statusCode: 400,
    });
  }

  return {
    imagePath: file.filepath,
    mimeType: file.mimetype,
    filename: sanitizeText(firstValue(fields.filename) || file.originalFilename, 120),
    symptoms: sanitizeText(firstValue(fields.symptoms), 1000),
  };
}

async function imageToBase64(imagePath) {
  const { readFile } = await import("node:fs/promises");
  const buffer = await readFile(imagePath);
  return buffer.toString("base64");
}

function parseJsonObject(rawText) {
  const text = String(rawText || "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI response did not contain JSON.");
    return JSON.parse(jsonMatch[0]);
  }
}

function normalizeResult(result, provider) {
  const injury = sanitizeText(result?.injury, 120) || "unknown injury";
  const severity = ["mild", "moderate", "severe"].includes(result?.severity)
    ? result.severity
    : "moderate";
  const confidence = /^\d{1,3}%$/.test(String(result?.confidence || ""))
    ? result.confidence
    : "70%";
  const steps = Array.isArray(result?.steps)
    ? result.steps.map((step) => sanitizeText(step, 240)).filter(Boolean).slice(0, 6)
    : [];

  if (steps.length < 3) {
    throw new Error("AI response did not include enough first aid steps.");
  }

  return {
    provider,
    injury,
    severity,
    confidence,
    steps,
    call_911: Boolean(result?.call_911 || severity === "severe"),
    disclaimer:
      sanitizeText(result?.disclaimer, 180) ||
      "This does not replace professional medical care.",
  };
}

function getFallbackResult({ filename, symptoms }, provider = "local") {
  const hint = `${filename} ${symptoms}`.toLowerCase();
  const injury = hint.includes("burn")
    ? "burn"
    : hint.includes("bleed") || hint.includes("blood")
      ? "bleeding"
      : "cut";
  const rule = FALLBACK_RULES[injury];

  return {
    provider,
    injury,
    severity: rule.severity,
    confidence: "60%",
    steps: rule.steps,
    call_911: injury === "bleeding",
    disclaimer:
      "Fallback guidance only. This does not replace professional medical care.",
  };
}

async function analyzeWithGemini(payload) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Gemini API key is not configured.");
  }

  const imageBase64 = await imageToBase64(payload.imagePath);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: payload.mimeType,
                  data: imageBase64,
                },
              },
              {
                text: `${SYSTEM_PROMPT}

Filename: ${payload.filename || "unknown"}
User-described symptoms: ${payload.symptoms || "none provided"}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: RESPONSE_SCHEMA,
          temperature: 0.2,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed with status ${response.status}.`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return normalizeResult(parseJsonObject(rawText), "gemini");
}

async function analyzeWithGroq(payload) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("Groq API key is not configured.");
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Analyze this first aid situation based on TEXT ONLY (no image available to this model).
Filename hint: ${payload.filename || "unknown"}
User-described symptoms: ${payload.symptoms || "none provided"}
Note: You cannot see the image. Use the filename and symptoms to give safe, conservative first aid guidance. If you are uncertain, recommend the user see a medical professional.`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 700,
  });

  return normalizeResult(
    parseJsonObject(completion.choices?.[0]?.message?.content),
    "groq",
  );
}

export default async function handler(req, res) {
  setCommonHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let payload;
  try {
    payload = await getRequestPayload(req);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }

  const providerErrors = [];

  for (const provider of [analyzeWithGemini, analyzeWithGroq]) {
    try {
      return res.status(200).json(await provider(payload));
    } catch (error) {
      providerErrors.push(error.message);
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.warn("AI providers unavailable:", providerErrors);
  }

  return res.status(200).json(getFallbackResult(payload));
}
