import { transcribe, toGloss } from "./gemini.js";
import { fallbackGloss, resolve } from "./gloss.js";
import { ClipPlayer } from "./player.js";

const $ = (id) => document.getElementById(id);
const els = {
  key: $("key"), mic: $("mic"), rate: $("rate"), replay: $("replay"),
  transcript: $("transcript"), gloss: $("gloss"), status: $("status"),
  typed: $("typed"), typedInput: $("typedInput"), screen: document.querySelector(".screen"),
};

let lexicon = { signs: {}, alphabet: {} };
let lastItems = [];
let recorder = null;
let chunks = [];

// Remember the key for this tab only.
try { els.key.value = sessionStorage.getItem("gemini-key") ?? ""; } catch {}
els.key.addEventListener("change", () => {
  try { sessionStorage.setItem("gemini-key", els.key.value.trim()); } catch {}
});

const setStatus = (msg, isError = false) => {
  els.status.textContent = msg;
  els.status.classList.toggle("err", isError);
};

const player = new ClipPlayer([$("v0"), $("v1")], $("pic"), {
  onStep: (token) => {
    els.screen.classList.add("playing");
    els.gloss.querySelectorAll("li").forEach((li, i) => li.classList.toggle("now", i === token));
  },
  onDone: () => {
    els.gloss.querySelectorAll("li.now").forEach((li) => li.classList.remove("now"));
    setStatus("");
  },
});

async function loadLexicon() {
  try {
    lexicon = await (await fetch("lexicon.json")).json();
    const n = Object.keys(lexicon.signs ?? {}).length;
    setStatus(`${n} signs loaded.`);
  } catch {
    setStatus("Could not load lexicon.json. Serve this folder over http (see README).", true);
  }
}

function renderGloss(tokens) {
  els.gloss.replaceChildren(
    ...tokens.map((t) => {
      const li = document.createElement("li");
      li.textContent = t.label;
      if (t.status === "fs") { li.classList.add("fs"); li.title = "Fingerspelled"; }
      if (t.status === "missing") { li.classList.add("missing"); li.title = "No clip for this sign yet"; }
      return li;
    })
  );
}

async function process(text) {
  text = text.trim();
  if (!text) return;
  els.transcript.textContent = text;
  const key = els.key.value.trim();

  let gloss;
  try {
    if (key) {
      setStatus("Converting to ASL gloss...");
      gloss = await toGloss(key, text, Object.keys(lexicon.signs ?? {}));
    } else {
      gloss = fallbackGloss(text);
      setStatus("Demo mode: no API key, so gloss uses simple rules.");
    }
  } catch (err) {
    gloss = fallbackGloss(text);
    setStatus(`Gloss API failed (${err.message}). Used simple rules instead.`, true);
  }

  const { items, tokens } = resolve(gloss, lexicon);
  renderGloss(tokens);
  lastItems = items;
  els.replay.disabled = !items.length;

  if (!items.length) return setStatus("None of these signs have clips yet. Add clips to lexicon.json.", true);
  player.play(items, Number(els.rate.value));
}

// ---- microphone ----
async function startRecording() {
  if (!els.key.value.trim()) return setStatus("Add a Gemini API key to use the microphone, or type a sentence.", true);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setStatus("Transcribing...");
      try {
        const text = await transcribe(els.key.value.trim(), new Blob(chunks, { type: recorder.mimeType }));
        await process(text);
      } catch (err) {
        setStatus(`Transcription failed: ${err.message}`, true);
      }
    };
    recorder.start();
    els.mic.setAttribute("aria-pressed", "true");
    els.mic.textContent = "Stop and translate";
    setStatus("Listening...");
  } catch {
    setStatus("Microphone blocked. Allow access in the browser and try again.", true);
  }
}

function stopRecording() {
  recorder?.stop();
  els.mic.setAttribute("aria-pressed", "false");
  els.mic.textContent = "Start speaking";
}

els.mic.addEventListener("click", () =>
  els.mic.getAttribute("aria-pressed") === "true" ? stopRecording() : startRecording()
);
els.typed.addEventListener("submit", (e) => {
  e.preventDefault();
  player.stop();
  process(els.typedInput.value);
});
els.replay.addEventListener("click", () => player.play(lastItems, Number(els.rate.value)));

loadLexicon();
