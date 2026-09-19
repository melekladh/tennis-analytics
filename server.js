const express = require('express');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({ limit: '30mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'tennis-analytics', vision: Boolean(process.env.OPENAI_API_KEY) }));

app.post('/api/analyze', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'OPENAI_API_KEY is not configured. Add it to your environment and restart the server.' });
    }
    const { frames } = req.body;
    if (!Array.isArray(frames) || frames.length === 0) {
      return res.status(400).json({ error: 'At least one video frame is required.' });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const content = [
      { type: 'text', text: 'Analyze these sequential frames from a tennis match. Return ONLY valid JSON with keys: court_coverage_percent (number), estimated_average_speed_mps (number), stroke_count_estimate (number), active_motion_seconds (number), posture_score (number 0-100), player_count (number), rally_summary (string), coaching_notes (array of strings). Be conservative and state estimates in the notes. Do not invent exact measurements.' },
      ...frames.slice(0, 8).map((frame) => ({ type: 'image_url', image_url: { url: frame, detail: 'low' } }))
    ];

    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content }]
    });
    res.json(JSON.parse(completion.choices[0].message.content));
  } catch (error) {
    console.error('Vision analysis failed:', error);
    res.status(500).json({ error: 'GPT-4o analysis failed. Check the server log and API key.' });
  }
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`Tennis analytics listening on http://localhost:${PORT}`));
