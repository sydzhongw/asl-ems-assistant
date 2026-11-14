import { fallbackGloss, resolve } from "./gloss.js";
import { ClipPlayer } from "./player.js";

const $ = (id) => document.getElementById(id);
const els = {
  mic: $("mic"), rate: $("rate"), replay: $("replay"),
  transcript: $("transcript"), gloss: $("gloss"), status: $("status"),
  typed: $("typed"), typedInput: $("typedInput"), screen: document.querySelector(".screen"),
};

let lexicon = { signs: {}, alphabet: {} };
let lastItems = [];
let recognition = null;
const failed = new Set();
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

const setStatus = (msg, isError = false) => {
  els.status.textContent = msg;
  els.status.classList.toggle("err", isError);
};

const player = new ClipPlayer([$("v0"), $("v1")], $("pic"), {
  onStep: (token) => {
    els.screen.classList.add("playing");
    els.gloss.querySelectorAll("li").forEach((li, i) => li.classList.toggle("now", i === token));
  },
  onError: (item) => failed.add(item.image ?? item.src),
  onDone: () => {
    els.gloss.querySelectorAll("li.now").forEach((li) => li.classList.remove("now"));
    if (failed.size) setStatus(`Couldn't load: ${[...failed].join(", ")}. Check the file names and folder.`, true);
    else setStatus("");
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

function process(text) {
  text = text.trim();
  if (!text) return;
  els.transcript.textContent = text;
  setStatus("");

  const gloss = fallbackGloss(text, Object.keys(lexicon.signs ?? {}));
  const { items, tokens } = resolve(gloss, lexicon);
  renderGloss(tokens);
  lastItems = items;
  els.replay.disabled = !items.length;

  if (!items.length) return setStatus("None of these words have signs or letter pictures yet. Check lexicon.json.", true);
  failed.clear();
  player.play(items, Number(els.rate.value));
}

// ---- microphone: the browser's built-in speech recognition ----
const MIC_ERRORS = {
  "not-allowed": "Microphone blocked. Click the lock icon in the address bar, allow the microphone, then reload.",
  "service-not-allowed": "This browser blocked speech recognition. Try Chrome or Edge, or type a sentence.",
  "network": "Speech recognition couldn't reach its service. Check your internet (Chrome and Edge need it), or type a sentence. Brave doesn't support this.",
  "no-speech": "Didn't hear anything. Check your microphone is the selected input and try again.",
  "audio-capture": "No microphone found. Plug one in or check your system sound settings.",
};

const setMicUI = (on) => {
  els.mic.setAttribute("aria-pressed", String(on));
  els.mic.textContent = on ? "Stop and translate" : "Start speaking";
};

function startListening() {
  if (!SR) return setStatus("This browser has no speech recognition. Use Chrome or Edge, or type a sentence.", true);
  if (!window.isSecureContext) {
    return setStatus("Open this page at http://localhost:8000 (not a file or network address) so the mic is allowed.", true);
  }
  player.stop();
  let heard = ""; // everything recognized so far, final or not
  recognition = new SR();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.onresult = (e) => {
    heard = [...e.results].map((r) => r[0].transcript).join(" ");
    els.transcript.textContent = heard;
  };
  recognition.onerror = (e) => setStatus(MIC_ERRORS[e.error] ?? `Speech recognition error: ${e.error}`, true);
  recognition.onend = () => {
    recognition = null;
    setMicUI(false);
    if (heard.trim()) process(heard);
    else if (!els.status.classList.contains("err")) setStatus("Didn't catch anything. Try again.", true);
  };
  try {
    recognition.start();
  } catch (err) {
    recognition = null;
    return setStatus(`Couldn't start the microphone: ${err.message}`, true);
  }
  setMicUI(true);
  setStatus("Listening... speak, then press the button again.");
}

els.mic.addEventListener("click", () => (recognition ? recognition.stop() : startListening()));
els.typed.addEventListener("submit", (e) => {
  e.preventDefault();
  player.stop();
  process(els.typedInput.value);
});
els.replay.addEventListener("click", () => { failed.clear(); player.play(lastItems, Number(els.rate.value)); });

loadLexicon();