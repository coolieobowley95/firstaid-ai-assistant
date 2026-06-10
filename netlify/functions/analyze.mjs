// Netlify Function: /api/analyze
// Mirrors api/analyze.js (Vercel). Gemini is the primary vision model
// and receives the base64 image. Groq is a text-only fallback.
// A local ICD-11 lookup is applied to enrich the response with ICD codes.

import Groq from "groq-sdk";
import { findICD } from "../../backend/utils/icdLookup.js";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// ===== Provider configuration & verification logging =====
console.log("Gemini API key present:", !!process.env.GEMINI_API_KEY);
console.log("Trying Gemini model:", process.env.GEMINI_MODEL || "gemini-2.5-flash");

if (!process.env.GEMINI_API_KEY) {
  console.warn("GEMINI_API_KEY is not set in environment; Gemini will be skipped and Groq used as fallback.");
}

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

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };
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

  // Enrich with ICD info. Backend lookup takes priority; AI-provided
  // ICD info is used as a fallback only.
  let icd_code = null;
  let icd_version = null;
  let icd_description = null;

  const lookup = findICD(injury);
  if (lookup) {
    icd_code = lookup.icd_code;
    icd_version = lookup.icd_version;
    icd_description = lookup.description;
  } else if (result?.icd_code) {
    icd_code = sanitizeText(result.icd_code, 16) || null;
    icd_version = sanitizeText(result.icd_version, 16) || "ICD-11";
    icd_description = sanitizeText(result.icd_description, 240) || null;
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
    icd_code,
    icd_version,
    icd_description,
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

async function readRequestPayload(req) {
  const contentType = req.headers.get("content-type") || "";

  let imageBase64;
  let mimeType = "image/png";
  let filename = "unknown";
  let symptoms = "";

  if (contentType.startsWith("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("image") || formData.get("file");

    if (!file) {
      throw Object.assign(new Error("Upload an image file."), { statusCode: 400 });
    }

    if (!ALLOWED_MIME_TYPES.has(file.type || "")) {
      throw Object.assign(new Error("Only JPEG, PNG, and WebP images are supported."), {
        statusCode: 400,
      });
    }

    const buffer = await file.arrayBuffer();
    if (buffer.byteLength > MAX_FILE_SIZE) {
      throw Object.assign(new Error("Image exceeds 5MB limit."), { statusCode: 413 });
    }

    imageBase64 = bufferToBase64(buffer);
    mimeType = file.type || mimeType;
    filename = sanitizeText(formData.get("filename") || file.name || "unknown", 120);
    symptoms = sanitizeText(formData.get("symptoms"), 1000);
  } else {
    const body = await req.json().catch(() => ({}));
    imageBase64 = body.imageBase64;
    mimeType = body.mimeType || mimeType;
    filename = sanitizeText(body.filename, 120);
    symptoms = sanitizeText(body.symptoms, 1000);
  }

  if (!imageBase64) {
    throw Object.assign(new Error("No image provided."), { statusCode: 400 });
  }

  return { imageBase64, mimeType, filename, symptoms };
}

function bufferToBase64(buf) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(buf).toString("base64");
  }
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function analyzeWithGemini(payload) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Gemini API key is not configured.");
  }

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
                  data: payload.imageBase64,
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

export default async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (req.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: corsHeaders() }
    );
  }

  let payload;
  try {
    payload = await readRequestPayload(req);
  } catch (error) {
    return Response.json(
      { error: error.message || "Invalid request" },
      { status: error.statusCode || 400, headers: corsHeaders() }
    );
  }

  const providerErrors = [];

  // Ordered list: Gemini is the primary vision provider, Groq is a fallback.
  const providers = [
    { name: "Gemini", fn: analyzeWithGemini },
    { name: "Groq", fn: analyzeWithGroq },
  ];

  for (const provider of providers) {
    try {
      const result = await provider.fn(payload);
      console.log(`Provider ${provider.name} succeeded.`);
      return Response.json(result, { status: 200, headers: corsHeaders() });
    } catch (error) {
      console.error(`Provider ${provider.name} failed:`, error.message);
      providerErrors.push({ provider: provider.name, message: error.message });
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.warn("AI providers unavailable:", providerErrors);
  }

  return Response.json(getFallbackResult(payload), {
    status: 200,
    headers: corsHeaders(),
  });
};

export const config = {
  path: "/api/analyze",
};
