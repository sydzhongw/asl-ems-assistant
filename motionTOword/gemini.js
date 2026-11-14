// Gemini calls: speech -> text, and text -> ASL gloss.
// NOTE: calling Gemini straight from the browser exposes the key. Fine for a
// hackathon demo; for a deployed app, move these two calls behind your own server.

const MODEL = "gemini-2.5-flash"; // change if your key has access to a different model
const endpoint = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;

async function generate(key, body) {
  const res = await fetch(endpoint(key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
}

// ---- audio: convert whatever the browser recorded into 16 kHz mono WAV ----
async function toWav16k(blob) {
  const decoded = await new AudioContext().decodeAudioData(await blob.arrayBuffer());
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const pcm = (await offline.startRendering()).getChannelData(0);

  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, pcm.length * 2, true);
  pcm.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Blob([buf], { type: "audio/wav" });
}

const toBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

export async function transcribe(key, audioBlob) {
  const wav = await toWav16k(audioBlob);
  return generate(key, {
    contents: [{
      parts: [
        { text: "Transcribe this speech exactly. Return only the transcript, no commentary." },
        { inline_data: { mime_type: "audio/wav", data: await toBase64(wav) } },
      ],
    }],
  });
}

const GLOSS_RULES = `You convert English into ASL gloss for a video-clip player.
Rules:
- Output uppercase gloss tokens, one per sign, in ASL word order.
- Drop articles (a, an, the), "to be" verbs, and most prepositions.
- Time first (TOMORROW, YESTERDAY), then topic, then comment. Often Object-Subject-Verb or Subject-Verb-Object, whichever is natural in ASL.
- Put WH-words (WHO, WHAT, WHERE, WHY, HOW) at the end of the question.
- Negation goes after the verb (e.g. I GO-STORE NOT). Use the lemma form of verbs (no -ing, -ed).
- Prefer tokens from the AVAILABLE SIGNS list, using synonyms that exist there when the meaning is the same.
- Proper names or words with no available sign: output FS-WORD (fingerspell), e.g. FS-MARIA.
- Do not add words that were not meant.`;

export async function toGloss(key, text, vocab) {
  const out = await generate(key, {
    systemInstruction: { parts: [{ text: GLOSS_RULES }] },
    contents: [{
      parts: [{ text: `AVAILABLE SIGNS: ${vocab.slice(0, 3000).join(", ")}\n\nEnglish: ${text}` }],
    }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: { gloss: { type: "ARRAY", items: { type: "STRING" } } },
        required: ["gloss"],
      },
    },
  });
  const gloss = JSON.parse(out).gloss;
  return gloss.map((g) => String(g).trim().toUpperCase()).filter(Boolean);
}
