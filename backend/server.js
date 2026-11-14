const express = require("express");
const fs = require("fs");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

const root = path.join(__dirname, "..");
const app = express();
app.use(express.json({ limit: "30mb" }));
app.use(express.static(path.join(root, "app")));
app.use("/data", express.static(path.join(root, "data")));
app.use("/assets", express.static(path.join(root, "assets")));

const { phrases } = JSON.parse(fs.readFileSync(path.join(root, "data/ems_questions.json"), "utf8"));
const ids = new Set(phrases.map((p) => p.id));
const list = phrases.map((p) => `${p.id}: ${p.english.join(" | ")}`).join("\n");

// Optional sign vocabulary (data/lexicon.json): used only as a text hint for the model.
function loadVocab() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(root, "data/lexicon.json"), "utf8"));
    const arr = Array.isArray(raw) ? raw : Array.isArray(raw.words) ? raw.words : Array.isArray(raw.signs) ? raw.signs : Object.keys(raw);
    const words = arr.map((w) => (typeof w === "string" ? w : w && (w.word || w.gloss || w.id || w.name || w.english))).filter(Boolean);
    return [...new Set(words.map((w) => String(w).trim().toUpperCase()))].slice(0, 400);
  } catch { return []; }
}
const vocab = loadVocab();
console.log(`Sign vocabulary loaded: ${vocab.length} words`);

if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_MODEL) {
  console.warn("Set GEMINI_API_KEY and GEMINI_MODEL in .env");
}
const ai = new GoogleGenAI({
  vertexai: true,
  apiKey: process.env.GEMINI_API_KEY
});
const model = process.env.GEMINI_MODEL;
const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash";

// ---- Quota protection ----
const MAX_CALLS = Number(process.env.MAX_GEMINI_CALLS || 60); // per server run; raise it on filming day
const ALLOW_LIVE = process.env.ALLOW_LIVE === "true";         // live mode is off unless you turn it on in .env
const MIN_GAP_MS = 1500;                                      // minimum time between Gemini requests
let calls = 0, lastCallAt = 0;
const tooFast = () => Date.now() - lastCallAt < MIN_GAP_MS;
console.log(`Gemini call cap this run: ${MAX_CALLS} (live mode ${ALLOW_LIVE ? "ON" : "off"})`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);

// Match common phrases locally so they cost no Gemini call.
function localMatch(text) {
  const spoken = new Set(norm(text));
  let best = { id: null, score: 0 };
  for (const p of phrases) for (const e of p.english) {
    const words = norm(e);
    const common = words.filter((w) => spoken.has(w)).length;
    const score = common / Math.max(spoken.size, words.length); // extra spoken words lower the score
    if (score > best.score) best = { id: p.id, score };
  }
  return best;
}

function friendly(e) {
  const msg = String((e && e.message) || e);
  if (msg.includes("CALL_CAP")) return "Gemini call limit for this run reached. Raise MAX_GEMINI_CALLS in .env.";
  if (/429|RESOURCE_EXHAUSTED/i.test(msg)) return "Gemini quota is used up right now. Tap a question instead.";
  if (/503|UNAVAILABLE|overload|high demand/i.test(msg)) return "Gemini is busy. Try again in a moment.";
  return "Translation failed. Try again.";
}

// 429/404: try the other model once (limits are per model). 503: retry once, then the other model.
const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT")), ms))]);
async function generate(params) {
  const models = [model, fallbackModel].filter((m, i, a) => m && a.indexOf(m) === i);
  let lastErr;
  for (const m of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (calls >= MAX_CALLS) throw new Error("CALL_CAP");
      try {
        calls++; lastCallAt = Date.now();
        console.log(`Gemini calls this run: ${calls}/${MAX_CALLS} (${m})`);
        return await withTimeout(ai.models.generateContent({ ...params, model: m }), 25000);
      } catch (e) {
        lastErr = e;
        const msg = String((e && e.message) || e);
        if (/429|RESOURCE_EXHAUSTED|404|NOT_FOUND|no longer available/i.test(msg)) break;
        if (!/503|UNAVAILABLE|high demand|overload/i.test(msg)) throw e;
        console.warn(`Gemini busy on ${m}, retrying once...`);
        await sleep(1500);
      }
    }
  }
  throw lastErr;
}

app.get("/api/usage", (req, res) => res.json({ calls, max: MAX_CALLS, live: ALLOW_LIVE }));

// Which clips actually exist, so the UI can grey out the rest.
app.get("/api/clips", (req, res) => {
  const have = phrases.filter((p) => fs.existsSync(path.join(root, p.clip))).map((p) => p.id);
  res.json({ have });
});

// EMT speech -> approved phrase id
const cache = new Map();
app.post("/api/english-to-asl", async (req, res) => {
  const text = String((req.body && req.body.text) || "").slice(0, 300);
  if (!text) return res.json({ phrase_id: null, confidence: 0 });
  const key = norm(text).join(" ");
  if (cache.has(key)) return res.json(cache.get(key));
  const local = localMatch(text);
  if (local.score >= 0.75) {
    const out = { phrase_id: local.id, confidence: 0.95, source: "local" };
    cache.set(key, out);
    return res.json(out);
  }
  if (tooFast()) return res.json({ phrase_id: null, confidence: 0, error: "Please wait a moment." });
  try {
    const r = await generate({
      contents:
        `An EMS responder said: "${text}"\nPick the single best matching phrase id from this approved list, or null if none fit.\n${list}\n` +
        `Respond only with JSON: {"phrase_id": string|null, "confidence": number between 0 and 1}. Never invent ids.`,
      config: { responseMimeType: "application/json" },
    });
    const out = JSON.parse(r.text);
    if (!ids.has(out.phrase_id)) return res.json({ phrase_id: null, confidence: 0 });
    const result = { phrase_id: out.phrase_id, confidence: Number(out.confidence) || 0 };
    cache.set(key, result);
    res.json(result);
  } catch (e) {
    console.error(String((e && e.message) || e).slice(0, 300));
    
    res.json({ phrase_id: null, confidence: 0, error: friendly(e) });
  }
});

// Patient signing video -> English sentence for the EMT (AI translation; EMT confirms with patient)
app.post("/api/asl-to-english", async (req, res) => {
  const { video, mimeType, live } = req.body || {};
  if (!video) return res.json({ text: null });
  if (live && !ALLOW_LIVE) return res.json({ text: null, reason: "live mode is off to save quota" });
  if (video.length > 12000000) return res.json({ text: null, reason: "clip too long, keep it under about 8 seconds" });
  if (tooFast()) return res.json({ text: null, reason: "please wait a moment between clips" });
  try {
    const hint = vocab.length ? `Signs the patient is likely to use (use these words when they fit): ${vocab.join(", ")}.\n` : "";
    const r = await generate({
      contents: [{ role: "user", parts: [
        { inlineData: { mimeType: mimeType || "video/webm", data: video } },
        { text: `This video shows a Deaf patient signing American Sign Language to an EMT during a medical emergency.\n${hint}` +
          `First list the individual signs you can clearly see, in order. Then write one short, plain English sentence for the EMT. ` +
          `If no one is signing, or the person is only moving normally, set sentence to null. Do not guess or add medical details that were not signed. If the signing is not clear, set sentence to null. ` +
          `Respond only with JSON: {"glosses": string[], "sentence": string|null, "confidence": number between 0 and 1}.` },
      ] }],
      config: { responseMimeType: "application/json" },
    });
    const out = JSON.parse(r.text);
    const ok = out.sentence && Number(out.confidence) >= (live ? 0.7 : 0.5);
    const reason = ok ? null : out.sentence ? "low confidence" : "no clear signing seen";
    res.json({ text: ok ? String(out.sentence) : null, reason, glosses: ok && Array.isArray(out.glosses) ? out.glosses.map(String) : [] });
  } catch (e) {
    console.error(String((e && e.message) || e).slice(0, 300));
    res.json({ text: null, error: friendly(e) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`SignLink EMS running at http://localhost:${port}`));