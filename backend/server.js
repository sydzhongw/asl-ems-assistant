const express = require("express");
const fs = require("fs");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

const app = express();
app.use(express.json({ limit: "30mb" }));
app.use(express.static(path.join(__dirname, "../app")));
app.use("/data", express.static(path.join(__dirname, "../data")));
app.use(express.static(path.join(__dirname, "../public"))); // clips: public/signs/<phrase_id>.mp4

const { phrases } = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/ems_questions.json"), "utf8"));
const ids = new Set(phrases.map((p) => p.id));
const list = phrases.map((p) => `${p.id}: ${p.english.join(" | ")}`).join("\n");

if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_MODEL) {
  console.warn("Set GEMINI_API_KEY and GEMINI_MODEL in .env");
}
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const model = process.env.GEMINI_MODEL;

// EMS speech -> approved phrase id
app.post("/api/english-to-asl", async (req, res) => {
  const text = String((req.body && req.body.text) || "").slice(0, 300);
  if (!text) return res.json({ phrase_id: null, confidence: 0 });
  try {
    const r = await ai.models.generateContent({
      model,
      contents:
        `An EMS responder said: "${text}"\nPick the single best matching phrase id from this approved list, or null if none fit.\n${list}\n` +
        `Respond only with JSON: {"phrase_id": string|null, "confidence": number between 0 and 1}. Never invent ids.`,
      config: { responseMimeType: "application/json" },
    });
    const out = JSON.parse(r.text);
    if (!ids.has(out.phrase_id)) return res.json({ phrase_id: null, confidence: 0 });
    res.json({ phrase_id: out.phrase_id, confidence: Number(out.confidence) || 0 });
  } catch (e) {
    console.error(e);
    res.json({ phrase_id: null, confidence: 0 });
  }
});

// Patient signing video -> English text (prototype; may be wrong, so the EMT confirms)
app.post("/api/asl-to-english", async (req, res) => {
  const { video, mimeType } = req.body || {};
  if (!video) return res.json({ text: null });
  try {
    const r = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [
        { inlineData: { mimeType: mimeType || "video/webm", data: video } },
        { text: "This video shows a person signing American Sign Language in an emergency. Translate it into one short, plain English sentence. If you cannot clearly identify the signs, reply exactly UNCLEAR. Do not guess and do not add anything else." },
      ] }],
    });
    const text = (r.text || "").trim();
    res.json({ text: text && !/^UNCLEAR/i.test(text) ? text : null });
  } catch (e) {
    console.error(e);
    res.json({ text: null });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`SignLink EMS running at http://localhost:${port}`));