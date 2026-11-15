const express = require("express");
const fs = require("fs");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");
const { GoogleGenAI } = require("@google/genai");

const root = path.join(__dirname, "..");
const app = express();
app.use(express.json({ limit: "30mb" }));
app.use(express.static(path.join(root, "dist")));
app.use(express.static(path.join(root, "app")));
app.use("/data", express.static(path.join(root, "data")));
app.use("/assets", express.static(path.join(root, "assets")));
app.use("/motionTOword", express.static(path.join(root, "motionTOword")));

/* ---------------- WebSocket signaling (for the WebRTC version of the UI) ---------------- */
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws" });
const roomPeers = new Map();

wss.on("connection", (ws, req) => {
  const params = new URL(req.url || "/", "http://localhost");
  const room = params.searchParams.get("room") || "default-call";
  const mode = params.searchParams.get("mode") || "ems";
  const members = roomPeers.get(room) || new Set();
  members.add(ws);
  roomPeers.set(room, members);

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (!msg || !msg.type) return;
      const payload = JSON.stringify({ ...msg, room, mode });
      members.forEach((peer) => {
        if (peer !== ws && peer.readyState === WebSocket.OPEN) peer.send(payload);
      });
    } catch (e) {
      console.warn("Bad signaling payload", e.message);
    }
  });

  ws.on("close", () => {
    const peers = roomPeers.get(room);
    if (!peers) return;
    peers.delete(ws);
    if (peers.size === 0) roomPeers.delete(room);
  });
});

/* ---------------- Data ---------------- */
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

/* ---------------- Gemini setup ---------------- */
if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_MODEL) {
  console.warn("Set GEMINI_API_KEY and GEMINI_MODEL in .env");
}
const ai = new GoogleGenAI({
  vertexai: true,
  apiKey: process.env.GEMINI_API_KEY,
});
const model = process.env.GEMINI_MODEL;
const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash";

// ---- Quota protection ----
const MAX_CALLS = Number(process.env.MAX_GEMINI_CALLS || 60);
const ALLOW_LIVE = process.env.ALLOW_LIVE === "true";
const MIN_GAP_MS = 1500;
let calls = 0, lastCallAt = 0;
const tooFast = () => Date.now() - lastCallAt < MIN_GAP_MS;
console.log(`Gemini call cap this run: ${MAX_CALLS} (live mode ${ALLOW_LIVE ? "ON" : "off"})`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);

/* ---------------- Helpers ---------------- */

// Accepts raw base64 OR a full data URL ("data:video/webm;codecs=vp8,opus;base64,AAAA...").
// Returns clean standard base64, or null if it is not valid base64.
function cleanBase64(input) {
  let s = String(input || "");
  const i = s.indexOf("base64,");
  if (i !== -1) s = s.slice(i + 7);
  s = s.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
  s = s.replace(/=+$/, "");
  if (!s || !/^[A-Za-z0-9+/]+$/.test(s)) return null;
  while (s.length % 4) s += "=";
  return s;
}

// "video/webm;codecs=vp8,opus" -> "video/webm"
function cleanMime(m) {
  const base = String(m || "").split(";")[0].trim().toLowerCase();
  return /^video\/[a-z0-9.+-]+$/.test(base) ? base : "video/webm";
}

// Model sometimes wraps JSON in ```json fences even when asked not to.
function parseModelJson(text) {
  const s = String(text || "").replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  return JSON.parse(s);
}

function friendly(e) {
  const msg = String((e && e.message) || e);
  if (msg.includes("CALL_CAP")) return "Gemini call limit for this run reached. Raise MAX_GEMINI_CALLS in .env.";
  if (/429|RESOURCE_EXHAUSTED/i.test(msg)) return "Gemini quota is used up right now. Tap a question instead.";
  if (/503|UNAVAILABLE|overload|high demand/i.test(msg)) return "Gemini is busy. Try again in a moment.";
  if (/400|INVALID_ARGUMENT/i.test(msg)) return "The recording could not be read. Try signing again.";
  if (/TIMEOUT/i.test(msg)) return "Gemini took too long. Try a shorter clip.";
  return "Translation failed. Try again.";
}

// Match common phrases locally so they cost no Gemini call.
function localMatch(text) {
  const spoken = new Set(norm(text));
  let best = { id: null, score: 0 };
  for (const p of phrases) for (const e of p.english) {
    const words = norm(e);
    const common = words.filter((w) => spoken.has(w)).length;
    const score = common / Math.max(spoken.size, words.length, 1);
    if (score > best.score) best = { id: p.id, score };
  }
  return best;
}

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT")), ms))]);

// 429/404: try the other model once. 503: retry once, then the other model.
// 400 is the caller's fault (bad input), so fail fast and do not count it against the quota.
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
        if (/400|INVALID_ARGUMENT/i.test(msg)) { calls--; throw e; }
        if (/429|RESOURCE_EXHAUSTED|404|NOT_FOUND|no longer available/i.test(msg)) break;
        if (!/503|UNAVAILABLE|high demand|overload/i.test(msg)) throw e;
        console.warn(`Gemini busy on ${m}, retrying once...`);
        await sleep(1500);
      }
    }
  }
  throw lastErr;
}

/* ---------------- API ---------------- */
app.get("/api/usage", (req, res) => res.json({ calls, max: MAX_CALLS, live: ALLOW_LIVE }));

// Which clips actually exist, so the UI can grey out the rest.
app.get("/api/clips", (req, res) => {
  const have = phrases.filter((p) => p.clip && fs.existsSync(path.join(root, p.clip))).map((p) => p.id);
  res.json({ have });
});

// ---- English (EMT speech/text) -> approved phrase id ----
const cache = new Map();
app.post("/api/english-to-asl", async (req, res) => {
  const text = String((req.body && req.body.text) || "").slice(0, 300).trim();
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
        `An EMS responder said: "${text}"\n` +
        `Pick the single best matching phrase id from this approved list, or null if none fit.\n${list}\n` +
        `Respond only with JSON: {"phrase_id": string|null, "confidence": number between 0 and 1}. Never invent ids.`,
      config: { responseMimeType: "application/json" },
    });
    const out = parseModelJson(r.text);
    if (!ids.has(out.phrase_id)) return res.json({ phrase_id: null, confidence: 0 });
    const result = { phrase_id: out.phrase_id, confidence: Number(out.confidence) || 0 };
    cache.set(key, result);
    res.json(result);
  } catch (e) {
    console.error("english-to-asl:", String((e && e.message) || e).slice(0, 300));
    res.json({ phrase_id: null, confidence: 0, error: friendly(e) });
  }
});

// ---- Patient signing video -> English sentence for the EMT ----
app.post("/api/asl-to-english", async (req, res) => {
  const body = req.body || {};
  const live = Boolean(body.live);
  if (!body.video) return res.json({ text: null, reason: "no video received" });
  if (live && !ALLOW_LIVE) return res.json({ text: null, reason: "live mode is off to save quota" });

  const data = cleanBase64(body.video);
  const mimeType = cleanMime(body.mimeType);
  if (!data || data.length < 1000) {
    console.error("Bad video payload. Length:", String(body.video).length, "Head:", String(body.video).slice(0, 60));
    return res.json({ text: null, error: "The recording was empty or corrupted. Try again." });
  }
  if (data.length > 12000000) return res.json({ text: null, reason: "clip too long, keep it under about 8 seconds" });
  if (tooFast()) return res.json({ text: null, reason: "please wait a moment between clips" });

  try {
    const hint = vocab.length
      ? `Signs the patient is likely to use (use these words when they fit): ${vocab.join(", ")}.\n`
      : "";
    const r = await generate({
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType, data } },
          {
            text:
              `This video shows a Deaf patient signing American Sign Language to an EMT during a medical emergency.\n${hint}` +
              `First list the individual signs you can clearly see, in order. Then write one short, plain English sentence for the EMT. ` +
              `If no one is signing, or the person is only moving normally, set sentence to null. ` +
              `Do not guess or add medical details that were not signed. If the signing is not clear, set sentence to null. ` +
              `Respond only with JSON: {"glosses": string[], "sentence": string|null, "confidence": number between 0 and 1}.`,
          },
        ],
      }],
      config: { responseMimeType: "application/json" },
    });
    const out = parseModelJson(r.text);
    const ok = out.sentence && Number(out.confidence) >= (live ? 0.7 : 0.5);
    const reason = ok ? null : out.sentence ? "low confidence" : "no clear signing seen";
    res.json({
      text: ok ? String(out.sentence) : null,
      reason,
      glosses: ok && Array.isArray(out.glosses) ? out.glosses.map(String) : [],
    });
  } catch (e) {
    console.error("asl-to-english:", String((e && e.message) || e).slice(0, 500));
    res.json({ text: null, error: friendly(e) });
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`SignLink EMS running at http://localhost:${port}`));