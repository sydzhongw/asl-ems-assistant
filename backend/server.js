
const express = require("express");
const fs = require("fs");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");
const {
  GoogleGenAI,
  createPartFromBase64,
} = require("@google/genai");

const root = path.join(__dirname, "..");
const app = express();

app.use(express.json({ limit: "30mb" }));

app.use(express.static(path.join(root, "app")));
app.use("/data", express.static(path.join(root, "data")));
app.use("/assets", express.static(path.join(root, "assets")));
app.use("/motionTOword", express.static(path.join(root, "motionTOword")));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const roomPeers = new Map();

// ======================================================
// WEBSOCKET SIGNALING
// ======================================================

wss.on("connection", (ws, req) => {
  const params = new URL(req.url || "/", "http://localhost");

  const room = params.searchParams.get("room") || "default-call";
  const mode = params.searchParams.get("mode") || "ems";

  const members = roomPeers.get(room) || new Set();

  members.add(ws);
  roomPeers.set(room, members);

  ws.room = room;
  ws.mode = mode;

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (!msg || !msg.type) return;

      const payload = {
        ...msg,
        room,
        mode,
      };

      members.forEach((peer) => {
        if (peer !== ws && peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify(payload));
        }
      });
    } catch (e) {
      console.warn("Bad signaling payload:", e.message);
    }
  });

  ws.on("close", () => {
    const peers = roomPeers.get(room);

    if (!peers) return;

    peers.delete(ws);

    if (peers.size === 0) {
      roomPeers.delete(room);
    }
  });
});

// ======================================================
// LOAD APPROVED EMS PHRASES
// ======================================================

const questionFile = path.join(root, "data/ems_questions.json");

const questionData = JSON.parse(
  fs.readFileSync(questionFile, "utf8")
);

const phrases = questionData.phrases || [];

const ids = new Set(phrases.map((p) => p.id));

const list = phrases
  .map((p) => `${p.id}: ${p.english.join(" | ")}`)
  .join("\n");

// ======================================================
// LOAD ASL VOCABULARY
// ======================================================

function loadVocab() {
  try {
    const raw = JSON.parse(
      fs.readFileSync(
        path.join(root, "data/lexicon.json"),
        "utf8"
      )
    );

    const arr = Array.isArray(raw)
      ? raw
      : Array.isArray(raw.words)
        ? raw.words
        : Array.isArray(raw.signs)
          ? raw.signs
          : Object.keys(raw);

    const words = arr
      .map((w) =>
        typeof w === "string"
          ? w
          : w &&
            (w.word ||
              w.gloss ||
              w.id ||
              w.name ||
              w.english)
      )
      .filter(Boolean);

    return [
      ...new Set(
        words.map((w) => String(w).trim().toUpperCase())
      ),
    ].slice(0, 400);
  } catch (e) {
    console.warn("Could not load ASL vocabulary:", e.message);
    return [];
  }
}

const vocab = loadVocab();

console.log(`Sign vocabulary loaded: ${vocab.length} words`);

// ======================================================
// GEMINI CONFIGURATION
// ======================================================

if (!process.env.GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY in .env");
  process.exit(1);
}

if (!process.env.GEMINI_MODEL) {
  console.error("Missing GEMINI_MODEL in .env");
  process.exit(1);
}

// Gemini API-key configuration.
// Do not set vertexai: true when using a Google AI Studio API key.

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const model = process.env.GEMINI_MODEL;

const fallbackModel =
  process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash";

// ======================================================
// QUOTA PROTECTION
// ======================================================

const MAX_CALLS = Number(
  process.env.MAX_GEMINI_CALLS || 60
);

const ALLOW_LIVE =
  process.env.ALLOW_LIVE === "true";

const MIN_GAP_MS = 1500;

let calls = 0;
let lastCallAt = 0;

const tooFast = () =>
  Date.now() - lastCallAt < MIN_GAP_MS;

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

console.log(
  `Gemini call cap this run: ${MAX_CALLS} (live mode ${
    ALLOW_LIVE ? "ON" : "off"
  })`
);

// ======================================================
// TEXT NORMALIZATION
// ======================================================

const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

// ======================================================
// LOCAL EMS PHRASE MATCHING
// ======================================================

function localMatch(text) {
  const spoken = new Set(norm(text));

  let best = {
    id: null,
    score: 0,
  };

  for (const p of phrases) {
    for (const english of p.english) {
      const words = norm(english);

      const common = words.filter(
        (word) => spoken.has(word)
      ).length;

      const score =
        common / Math.max(spoken.size, words.length);

      if (score > best.score) {
        best = {
          id: p.id,
          score,
        };
      }
    }
  }

  return best;
}

// ======================================================
// ERROR HANDLING
// ======================================================

function friendly(e) {
  const msg = String((e && e.message) || e);

  if (msg.includes("CALL_CAP")) {
    return "Gemini call limit for this run reached.";
  }

  if (/429|RESOURCE_EXHAUSTED/i.test(msg)) {
    return "Gemini quota is used up right now. Try again later.";
  }

  if (/503|UNAVAILABLE|overload|high demand/i.test(msg)) {
    return "Gemini is busy. Try again in a moment.";
  }

  if (/400|INVALID_ARGUMENT/i.test(msg)) {
    return "Gemini rejected the request. Check the video format and server logs.";
  }

  return "Translation failed. Check the server log for details.";
}

function logGeminiError(label, e) {
  console.error(`\n${label}`);

  console.error("Message:", e?.message || e);

  if (e?.status) {
    console.error("Status:", e.status);
  }

  if (e?.error) {
    console.error(
      "Error details:",
      JSON.stringify(e.error, null, 2)
    );
  }

  if (e?.response) {
    console.error(
      "Response:",
      JSON.stringify(e.response, null, 2)
    );
  }

  console.error("");
}

// ======================================================
// TIMEOUT
// ======================================================

async function withTimeout(promise, ms) {
  let timer;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("TIMEOUT")),
          ms
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// ======================================================
// GEMINI REQUEST HELPER
// ======================================================

async function generate(params) {
  const models = [
    model,
    fallbackModel,
  ].filter(
    (m, i, arr) => m && arr.indexOf(m) === i
  );

  let lastErr;

  for (const currentModel of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (calls >= MAX_CALLS) {
        throw new Error("CALL_CAP");
      }

      try {
        calls++;
        lastCallAt = Date.now();

        console.log(
          `Gemini calls this run: ${calls}/${MAX_CALLS} (${currentModel})`
        );

        const response = await withTimeout(
          ai.models.generateContent({
            ...params,
            model: currentModel,
          }),
          25000
        );

        return response;
      } catch (e) {
        lastErr = e;

        const msg = String(
          (e && e.message) || e
        );

        if (
          /429|RESOURCE_EXHAUSTED|404|NOT_FOUND|no longer available/i.test(
            msg
          )
        ) {
          break;
        }

        if (
          !/503|UNAVAILABLE|high demand|overload/i.test(
            msg
          )
        ) {
          throw e;
        }

        console.warn(
          `Gemini busy on ${currentModel}; retrying once...`
        );

        await sleep(1500);
      }
    }
  }

  throw lastErr;
}

// ======================================================
// USAGE ENDPOINT
// ======================================================

app.get("/api/usage", (req, res) => {
  res.json({
    calls,
    max: MAX_CALLS,
    live: ALLOW_LIVE,
  });
});

// ======================================================
// AVAILABLE VIDEO CLIPS
// ======================================================

app.get("/api/clips", (req, res) => {
  const have = phrases
    .filter((p) =>
      fs.existsSync(path.join(root, p.clip))
    )
    .map((p) => p.id);

  res.json({ have });
});

// ======================================================
// ENGLISH SPEECH -> APPROVED ASL PHRASE
// ======================================================

const cache = new Map();

app.post("/api/english-to-asl", async (req, res) => {
  const text = String(
    (req.body && req.body.text) || ""
  ).slice(0, 300);

  if (!text.trim()) {
    return res.json({
      phrase_id: null,
      confidence: 0,
    });
  }

  const key = norm(text).join(" ");

  if (cache.has(key)) {
    return res.json(cache.get(key));
  }

  const local = localMatch(text);

  if (local.score >= 0.75) {
    const out = {
      phrase_id: local.id,
      confidence: 0.95,
      source: "local",
    };

    cache.set(key, out);

    return res.json(out);
  }

  if (tooFast()) {
    return res.json({
      phrase_id: null,
      confidence: 0,
      error: "Please wait a moment.",
    });
  }

  try {
    const r = await generate({
      contents:
        `An EMS responder said: "${text}"\n` +
        "Pick the single best matching phrase id from this approved list, or null if none fit.\n" +
        `${list}\n` +
        'Respond only with JSON: {"phrase_id": string|null, "confidence": number between 0 and 1}. Never invent ids.',

      config: {
        responseMimeType: "application/json",
      },
    });

    const out = JSON.parse(r.text);

    if (!ids.has(out.phrase_id)) {
      return res.json({
        phrase_id: null,
        confidence: 0,
      });
    }

    const result = {
      phrase_id: out.phrase_id,
      confidence: Number(out.confidence) || 0,
    };

    cache.set(key, result);

    return res.json(result);
  } catch (e) {
    logGeminiError("English-to-ASL error:", e);

    return res.json({
      phrase_id: null,
      confidence: 0,
      error: friendly(e),
    });
  }
});

// ======================================================
// VIDEO BASE64 VALIDATION
// ======================================================

function decodeVideo(video) {
  if (
    typeof video !== "string" ||
    !video.trim()
  ) {
    throw new Error("No video data was received.");
  }

  let base64 = video.trim();

  // Remove data URL prefix if the frontend sends one.
  if (base64.startsWith("data:")) {
    const comma = base64.indexOf(",");

    if (comma === -1) {
      throw new Error("Invalid video data URL.");
    }

    base64 = base64.slice(comma + 1);
  }

  // Remove whitespace.
  base64 = base64.replace(/\s/g, "");

  if (!base64.length) {
    throw new Error("The uploaded video is empty.");
  }

  // Base64 validation.
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new Error("The video contains invalid Base64 characters.");
  }

  if (base64.length % 4 === 1) {
    throw new Error("The video has an invalid Base64 length.");
  }

  const buffer = Buffer.from(base64, "base64");

  if (!buffer.length) {
    throw new Error("The video contains no bytes.");
  }

  // Confirm that the decoded bytes can be re-encoded.
  const normalized = buffer.toString("base64");

  if (
    normalized.replace(/=+$/, "") !==
    base64.replace(/=+$/, "")
  ) {
    throw new Error("The video Base64 data is malformed.");
  }

  return {
    buffer,
    base64: normalized,
  };
}

// ======================================================
// PATIENT ASL VIDEO -> ENGLISH
// ======================================================

app.post("/api/asl-to-english", async (req, res) => {
  const {
    video,
    mimeType,
    live,
  } = req.body || {};

  // Live-mode protection.
  if (live && !ALLOW_LIVE) {
    return res.json({
      text: null,
      reason: "Live mode is off to save quota.",
    });
  }

  // Check for missing video.
  if (
    typeof video !== "string" ||
    !video.trim()
  ) {
    return res.status(400).json({
      text: null,
      error: "No video was received. Please record again.",
    });
  }

  // Prevent excessively large requests.
  if (video.length > 12000000) {
    return res.status(413).json({
      text: null,
      reason: "Clip too long. Keep it under about 8 seconds.",
    });
  }

  // Prevent requests from arriving too quickly.
  if (tooFast()) {
    return res.json({
      text: null,
      reason: "Please wait a moment between clips.",
    });
  }

  // Validate and decode the video.
  let decoded;

  try {
    decoded = decodeVideo(video);
  } catch (e) {
    console.error("Video validation error:", e.message);

    return res.status(400).json({
      text: null,
      error: e.message,
    });
  }

  const videoBuffer = decoded.buffer;
  const normalizedVideo = decoded.base64;

  // Normalize MIME type.
  const cleanMimeType = String(
    mimeType || "video/webm"
  )
    .split(";")[0]
    .trim()
    .toLowerCase();

  const allowedMimeTypes = [
    "video/webm",
    "video/mp4",
  ];

  if (!allowedMimeTypes.includes(cleanMimeType)) {
    return res.status(400).json({
      text: null,
      error: `Unsupported video format: ${cleanMimeType}`,
    });
  }

  // Log metadata without exposing the video.
  console.log("Incoming ASL video:", {
    hasVideo: Boolean(video),
    videoType: typeof video,
    originalLength: video.length,
    bufferLength: videoBuffer.length,
    base64Length: normalizedVideo.length,
    mimeType: cleanMimeType,
    base64Start: normalizedVideo.slice(0, 20),
    live: Boolean(live),
  });

  try {
    const hint = vocab.length
      ? `Possible signs in the vocabulary: ${vocab.join(", ")}.\n`
      : "";

    const prompt =
      "This video shows a Deaf patient signing American Sign Language to an EMT during a medical emergency.\n" +
      `${hint}` +
      "Identify only signs that are clearly visible, in the order they occur. " +
      "Then provide one short, plain-English sentence describing what the patient communicated. " +
      "Do not guess, invent signs, or add medical details that were not communicated. " +
      "If no signing is visible, or the signing is unclear, set sentence to null. " +
      'Respond only with JSON: {"glosses": string[], "sentence": string|null, "confidence": number between 0 and 1}.';

    // Use the official SDK helper to construct the video part.
    const videoPart = createPartFromBase64(
      normalizedVideo,
      cleanMimeType
    );

    const r = await generate({
      contents: [
        {
          role: "user",
          parts: [
            videoPart,
            {
              text: prompt,
            },
          ],
        },
      ],

      config: {
        responseMimeType: "application/json",
      },
    });

    if (!r.text) {
      throw new Error("Gemini returned an empty response.");
    }

    const out = JSON.parse(r.text);

    const confidence = Number(out.confidence) || 0;

    const sentence =
      typeof out.sentence === "string"
        ? out.sentence.trim()
        : null;

    const threshold = live ? 0.7 : 0.5;

    const ok =
      Boolean(sentence) &&
      confidence >= threshold;

    const reason = ok
      ? null
      : sentence
        ? "The translation confidence was too low."
        : "No clear signing was detected.";

    return res.json({
      text: ok ? sentence : null,
      reason,

      glosses:
        ok && Array.isArray(out.glosses)
          ? out.glosses.map(String)
          : [],

      confidence,
    });
  } catch (e) {
    logGeminiError("ASL-to-English Gemini error:", e);

    return res.status(500).json({
      text: null,
      error: friendly(e),
    });
  }
});

// ======================================================
// START SERVER
// ======================================================

const port = process.env.PORT || 3000;

server.listen(port, () => {
  console.log(
    `SignLink EMS running at http://localhost:${port}`
  );
});
