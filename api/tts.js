// Vercel serverless function: on-demand text-to-speech via ElevenLabs.
//
// Used by index.html for personalized lines that contain the kid's name
// (those can't be pre-recorded). All "fixed" lines still play from the
// pre-generated MP3s in /audio/<character>/. This function only runs for
// dynamic lines, so the API spend stays small.
//
// Required Vercel project env vars:
//   ELEVEN_API_KEY            your ElevenLabs API key
//   ELEVEN_VOICE_NARRATOR     voice ID for the narrator
//   ELEVEN_VOICE_CHARLIE      voice ID for Charlie
//   ELEVEN_VOICE_GABRIEL      voice ID for Gabriel
//   ELEVEN_VOICE_LYNN         voice ID for Lynn
//   ELEVEN_VOICE_MAYA         voice ID for Maya
//
// (Set these in your Vercel project → Settings → Environment Variables.)

export const config = { runtime: 'nodejs' };

const VOICE_ENV = {
  narrator: 'ELEVEN_VOICE_NARRATOR',
  charlie:  'ELEVEN_VOICE_CHARLIE',
  gabriel:  'ELEVEN_VOICE_GABRIEL',
  lynn:     'ELEVEN_VOICE_LYNN',
  maya:     'ELEVEN_VOICE_MAYA',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  // Vercel parses JSON automatically when content-type is application/json
  const { text, character } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'missing text' });
  }
  if (text.length > 500) {
    return res.status(400).json({ error: 'text too long' });
  }
  const charKey = String(character || 'narrator').toLowerCase();
  const envKey = VOICE_ENV[charKey];
  if (!envKey) return res.status(400).json({ error: 'unknown character' });

  const apiKey = process.env.ELEVEN_API_KEY;
  const voiceId = process.env[envKey];
  if (!apiKey)  return res.status(500).json({ error: 'ELEVEN_API_KEY not set' });
  if (!voiceId) return res.status(500).json({ error: `${envKey} not set` });

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  const upstream = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.55,
        similarity_boost: 0.75,
        style: 0.10,
        use_speaker_boost: true,
      },
    }),
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    return res.status(upstream.status).json({ error: errText.slice(0, 500) });
  }

  const buf = Buffer.from(await upstream.arrayBuffer());
  res.setHeader('Content-Type', 'audio/mpeg');
  // Cache aggressively — same text+character always returns the same audio
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  return res.send(buf);
}
