// Netlify Function: /api/analyze
// Mirrors api/analyze.js (Vercel). Shared logic lives in ../../shared/.

import {
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
} from "../../shared/constants.js";
import {
  sanitizeText,
  runAnalysis,
} from "../../shared/analyzeUtils.js";

// ===== Provider configuration & verification logging =====
console.log("Gemini API key present:", !!process.env.GEMINI_API_KEY);
console.log("Trying Gemini model:", process.env.GEMINI_MODEL || "gemini-2.5-flash");

if (!process.env.GEMINI_API_KEY) {
  console.warn("GEMINI_API_KEY is not set in environment; Gemini will be skipped and Groq used as fallback.");
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };
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

export default async (req) => {
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

  const { result } = await runAnalysis(payload);
  return Response.json(result, { status: 200, headers: corsHeaders() });
};

export const config = {
  path: "/api/analyze",
};
