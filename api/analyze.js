import formidable from 'formidable';
import fs from 'fs';
import Groq from 'groq-sdk';

export const config = {
  api: {
    bodyParser: false
  }
};

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are a first aid assistant. When given a description or image of an injury or medical situation, respond ONLY with valid JSON in this exact format:
{
  "injury": "brief injury type (e.g. cut, burn, fracture)",
  "severity": "mild | moderate | severe",
  "confidence": "percentage like 85%",
  "steps": ["step 1", "step 2", "step 3", "step 4"],
  "call_911": true or false,
  "disclaimer": "This does not replace professional medical care."
}
Do not include any text outside the JSON.`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = new formidable.IncomingForm({
    keepExtensions: true,
    maxFileSize: 5 * 1024 * 1024
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to parse request' });
    }

    try {
      // Get filename or symptom description from the form
      const filename = Array.isArray(fields.filename)
        ? fields.filename[0]
        : fields.filename || '';
      const symptoms = Array.isArray(fields.symptoms)
        ? fields.symptoms[0]
        : fields.symptoms || '';

      // Build a user message from filename + any symptom text
      const userMessage = symptoms
        ? `The patient describes: ${symptoms}`
        : `An image was uploaded with filename: "${filename}". Based on the filename and context, provide first aid guidance as if this injury was confirmed.`;

      const completion = await groq.chat.completions.create({
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.3,
        max_tokens: 500
      });

      const rawText = completion.choices[0]?.message?.content || '';

      // Safely parse JSON from the response
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const result = JSON.parse(jsonMatch[0]);

      // Validate required fields exist
      if (!result.injury || !result.steps) {
        throw new Error('Invalid response structure');
      }

      return res.json(result);

    } catch (error) {
      console.error('Groq API error:', error);
      return res.status(500).json({
        error: 'AI analysis failed',
        details: error.message
      });
    }
  });
}