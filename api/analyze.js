// Vercel serverless /api/analyze endpoint.
// Gemini is the primary vision provider, Groq is a text-only fallback.
// Shared logic lives in ../shared/ to avoid duplication with the Netlify function.

import formidable from "formidable";
import {
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
} from "../shared/constants.js";
import {
  firstValue,
  sanitizeText,
  runAnalysis,
} from "../shared/analyzeUtils.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

// ===== Provider configuration & verification logging =====
console.log("Gemini API key present:", !!process.env.GEMINI_API_KEY);
console.log("Trying Gemini model:", process.env.GEMINI_MODEL || "gemini-2.5-flash");

if (!process.env.GEMINI_API_KEY) {
  console.warn("GEMINI_API_KEY is not set in environment; Gemini will be skipped and Groq used as fallback.");
}

function setCommonHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
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

  // Convert file on disk to base64 for the shared analysis pipeline.
  const imageBase64 = await imageToBase64(payload.imagePath);
  const analysisPayload = {
    imageBase64,
    mimeType: payload.mimeType,
    filename: payload.filename,
    symptoms: payload.symptoms,
  };

  const { result } = await runAnalysis(analysisPayload);
  return res.status(200).json(result);
}
