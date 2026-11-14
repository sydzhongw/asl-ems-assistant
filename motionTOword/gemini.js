// Optional speech-to-text with Gemini. Only used when a Gemini key is pasted in the header.
// NOTE: calling Gemini straight from the browser exposes the key. Fine for a hackathon
// demo; for a deployed app, send this request through your own server instead.

const API = "https://generativelanguage.googleapis.com/v1beta";
const PREFERRED = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"];
let picked = { key: "", model: "" };

async function apiError(res) {
  let msg = res.statusText;
  try { msg = (await res.json()).error?.message ?? msg; } catch { /* keep statusText */ }
  const hint = {
    400: "Check the key was copied in full.",
    403: "This key isn't allowed to use the Gemini API.",
    404: "Model not found.",
    429: "Quota or rate limit hit. Wait a minute or use another key.",
  }[res.status] ?? "";
  return new Error(`Gemini ${res.status}: ${msg} ${hint}`.trim());
}

// Ask Google which models this key can use, so a retired model name never breaks the demo.
// This also checks the key itself before any audio is sent.
async function getModel(key) {
  if (picked.key === key) return picked.model;
  const res = await fetch(`${API}/models?pageSize=200&key=${encodeURIComponent(key)}`);
  if (!res.ok) throw await apiError(res);
  const { models = [] } = await res.json();
  const usable = models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace("models/", ""));
  const stableFlash = usable
    .filter((n) => /flash/.test(n) && !/(lite|image|tts|live|exp|preview|thinking)/.test(n))
    .sort()
    .reverse();
  const model = PREFERRED.find((p) => usable.includes(p)) ?? stableFlash[0] ?? usable[0];
  if (!model) throw new Error("This key has no models that support generateContent.");
  picked = { key, model };
  return model;
}

// Convert whatever the browser recorded into 16 kHz mono WAV, which Gemini accepts.
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
  const model = await getModel(key);

  let audio;
  try {
    audio = await toWav16k(audioBlob);
  } catch (err) {
    console.warn("WAV conversion failed, sending the raw recording instead:", err);
    audio = audioBlob;
  }
  const mime = audio.type.split(";")[0] || "audio/webm";

  const res = await fetch(`${API}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: "Transcribe this speech exactly. Return only the transcript, no commentary. If there is no speech, return nothing." },
          { inline_data: { mime_type: mime, data: await toBase64(audio) } },
        ],
      }],
    }),
  });
  if (!res.ok) throw await apiError(res);

  const json = await res.json();
  const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text && json.promptFeedback?.blockReason) throw new Error(`blocked: ${json.promptFeedback.blockReason}`);
  return text;
}