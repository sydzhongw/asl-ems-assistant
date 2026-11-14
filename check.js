console.log('key set:', !!process.env.GEMINI_API_KEY, '| model:', process.env.GEMINI_MODEL);
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after 20s, no answer from Google')), 20000));
Promise.race([ai.models.generateContent({ model: process.env.GEMINI_MODEL, contents: 'Say OK' }), timeout])
  .then(r => { console.log('Gemini replied:', r.text); process.exit(0); })
  .catch(e => { console.log('ERROR:', e.message); process.exit(1); });
