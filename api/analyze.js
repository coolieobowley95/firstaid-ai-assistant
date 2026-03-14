import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = new formidable.IncomingForm({
    keepExtensions: true,
    maxFileSize: 5 * 1024 * 1024 // 5MB
  });

  form.parse(req, async (err, fields, files) => {
    try {
      if (err) {
        console.error('Form parse error:', err);
        return res.status(500).json({ error: 'Failed to parse uploaded file' });
      }

      const imageFile = files.image?.[0] || files.image; // formidable v3 uses array
      if (!imageFile) {
        return res.status(400).json({ error: 'No image uploaded' });
      }

      // Simulated analysis result - replace with actual AI logic later
      const mockResult = {
        injury: 'cut',
        confidence: '85%',
        steps: [
          'Clean the wound with water',
          'Apply antiseptic',
          'Cover with a clean bandage',
          'Seek medical attention if deep or bleeding persists'
        ],
        disclaimer: 'This does not replace professional medical care.',
        mock: true
      };

      return res.json(mockResult);

    } catch (error) {
      console.error('Server error:', error);
      return res.status(500).json({ error: 'Analysis failed' });
    }
  });
};