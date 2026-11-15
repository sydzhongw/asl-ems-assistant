// Builds app/index.html from app/demo.html (the PeerJS patient/EMS screens) and adds:
//   - AI read-aloud of the patient's translated signing (EMS side), with a toggle
//   - "Interpreter" request button + banners on both sides
//   - a call timer
// Run from the project root:  node merge-ui.js
// All-or-nothing: if any anchor is missing, nothing is written or deleted.


const fs = require("fs");
const SRC = "app/demo.html";
const OUT = "app/index.html";


if (!fs.existsSync(SRC)) {
  console.log("STOP: app/demo.html not found (already merged?).");
  process.exit(1);
}


let t = fs.readFileSync(SRC, "utf8");


const edits = [
  ["</style>",
`.banner{background:#7f1d1d;color:#fff;padding:10px 20px;font-weight:600;font-size:14px;text-align:center}
#timer{font-size:12px;color:#94a3b8}
</style>`],


  ['<div id="patient" class="screen">',
`<div id="patient" class="screen">
 <div class="banner" id="pBanner" hidden>EMS asked for a human ASL interpreter. Keep using gestures and the buttons.</div>`],


  ['<div id="ems" class="screen">',
`<div id="ems" class="screen">
 <div class="banner" id="banner" hidden>Human ASL interpreter requested. Keep communicating by typing and tapping questions.</div>`],


  ['<span class="badge" id="eStatus">Starting…</span>',
   '<span class="badge" id="eStatus">Starting…</span><span id="timer">00:00</span>'],


  ['<button class="cc end" onclick="endCall()"><i>✕</i><span>End call</span></button>',
`<button class="cc" id="ttsBtn" onclick="toggleTTS()"><i>🔊</i><span>Read aloud</span></button>
   <button class="cc" onclick="requestInterpreter()"><i>🤟</i><span>Interpreter</span></button>
   <button class="cc end" onclick="endCall()"><i>✕</i><span>End call</span></button>`],


  ['if (m.t === "say") onSay(m);',
`if (m.t === "interp") $("pBanner").hidden = false;
 if (m.t === "say") onSay(m);`],


  ['$("cap").textContent = m.text; $("warn").hidden = true;',
   '$("cap").textContent = m.text; $("warn").hidden = true; speak(m.text);'],


  ["sr.onresult = e => {",
`sr.onresult = e => {
   if (ttsLocked()) return; // don't transcribe our own read-aloud`],


  ['function endCall() { leave(""); }',
`function endCall() { leave(""); }


/* ---- Read aloud: the EMT hears the patient's translated signing ---- */
let ttsOn = true, ttsBusy = false, ttsUntil = 0;
const ttsLocked = () => ttsBusy || Date.now() < ttsUntil;
function speak(text) {
  if (!ttsOn || !text || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(String(text));
  u.lang = "en-US"; u.rate = 0.95;
  const done = () => { ttsBusy = false; ttsUntil = Date.now() + 700; };
  u.onend = done; u.onerror = done;
  ttsBusy = true; speechSynthesis.speak(u);
}
function toggleTTS() {
  ttsOn = !ttsOn;
  if (!ttsOn && "speechSynthesis" in window) { speechSynthesis.cancel(); ttsBusy = false; }
  setCtl("ttsBtn", !ttsOn, ttsOn ? "🔊" : "🔈", ttsOn ? "Read aloud" : "Read: off");
}


/* ---- Interpreter request ---- */
function requestInterpreter() {
  $("banner").hidden = false;
  if (conn && conn.open) conn.send({ t: "interp" });
}


/* ---- Call timer + cleanup when the call ends ---- */
let sec = 0;
setInterval(() => {
  if (role && conn && conn.open) {
    sec++;
    $("timer").textContent = String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
  } else if (!role) {
    sec = 0; $("timer").textContent = "00:00";
    $("banner").hidden = true; $("pBanner").hidden = true;
    if (ttsBusy) { speechSynthesis.cancel(); ttsBusy = false; }
  }
}, 1000);`],
];


const missing = [];
for (const [anchor] of edits) {
  const n = t.split(anchor).length - 1;
  if (n !== 1) missing.push(`${n}x  ${anchor.slice(0, 60)}`);
}
if (missing.length) {
  console.log("STOP: anchors not found exactly once, nothing changed:");
  missing.forEach((m) => console.log("  " + m));
  process.exit(1);
}


for (const [anchor, replacement] of edits) t = t.replace(anchor, () => replacement);


fs.writeFileSync(OUT, t);
fs.unlinkSync(SRC);
console.log("DONE: wrote app/index.html and removed app/demo.html");



