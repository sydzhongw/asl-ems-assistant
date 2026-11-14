// Turns English into ASL gloss and then into playable clips. No network, no API.

// Words that have no sign of their own. They are dropped unless your lexicon has them.
const STOP = new Set([
  "a", "an", "the", "is", "are", "am", "was", "were", "be", "been", "being", "to", "of",
  "do", "does", "did", "will", "would", "shall", "should", "in", "on", "at", "for", "with",
  "by", "it", "this", "that", "there", "and", "so", "very", "really",
]);
const TIME = new Set(["today", "yesterday", "tomorrow", "tonight", "now", "later"]);
const WH = new Set(["who", "what", "where", "why", "how", "when"]);
// Words that map to a different sign name in your lexicon.
const ALIAS = { i: "me", mine: "my", yours: "your", ate: "eat", went: "go", gone: "go", drank: "drink", felt: "feel" };

// Possible lexicon spellings of a word: arm -> ARMS, feeling -> FEEL, coughed -> COUGH ...
function forms(w) {
  const out = [w, w + "s", w + "es"];
  if (w.endsWith("ies")) out.push(w.slice(0, -3) + "y");
  if (w.endsWith("es")) out.push(w.slice(0, -2));
  if (w.endsWith("s")) out.push(w.slice(0, -1));
  if (w.endsWith("ing")) { const s = w.slice(0, -3); out.push(s, s + "e", s.slice(0, -1)); }
  if (w.endsWith("ed")) { const s = w.slice(0, -2); out.push(s, s + "e", s.slice(0, -1)); }
  return out.filter((f) => f === w || f.length >= 3);
}

function findSign(word, vocab) {
  for (const f of [ALIAS[word], ...forms(word)]) {
    if (f && vocab.has(f.toUpperCase())) return f.toUpperCase();
  }
  return null;
}

// English sentence -> list of gloss tokens, using only the signs in your lexicon.
// Words with no sign stay as plain tokens and get fingerspelled later.
export function fallbackGloss(text, vocabKeys = []) {
  const vocab = new Set(vocabKeys.map((k) => k.toUpperCase()));
  const words = text
    .toLowerCase()
    .replace(/won't/g, "will not")
    .replace(/can't/g, "can not")
    .replace(/n't/g, " not")
    .replace(/'(m|re|s|ll|ve|d)\b/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const time = [];
  const body = [];
  const wh = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const pair = words[i + 1] && `${w}-${words[i + 1]}`.toUpperCase(); // "thank you" -> THANK-YOU
    let token;
    if (pair && vocab.has(pair)) { token = pair; i++; }
    else token = findSign(w, vocab) ?? (STOP.has(w) ? null : w.toUpperCase());
    if (!token) continue;
    (TIME.has(w) ? time : WH.has(w) ? wh : body).push(token);
  }
  return [...time, ...body, ...wh]; // time first, question words last
}

// A lexicon entry can be a string path or { clip, start, end }.
const IMAGE = /\.(png|jpe?g|webp|gif|svg)$/i;
function normalize(entry, seconds) {
  if (!entry) return null;
  const path = typeof entry === "string" ? entry : entry.clip ?? entry.src ?? entry.image;
  if (!path) return null;
  // Images (e.g. letter pictures) are held on screen for `seconds`.
  if (IMAGE.test(path)) return { image: path, seconds: entry.seconds ?? seconds };
  return typeof entry === "string" ? { src: path } : { src: path, start: entry.start, end: entry.end };
}

// Turn gloss tokens into a flat list of playable clips.
// Each clip remembers which gloss token it belongs to so the UI can highlight it.
// Returns { items, tokens } where tokens[i] = { label, status: "sign" | "fs" | "missing" }.
export function resolve(gloss, lexicon) {
  const signs = lexicon.signs ?? {};
  const alphabet = lexicon.alphabet ?? {};
  const secs = lexicon.imageSeconds ?? 1.2; // how long each picture stays up
  const withTrim = (it) =>
    it.image ? it : { ...it, start: it.start ?? lexicon.trimStart, trimEnd: lexicon.trimEnd };
  const items = [];
  const tokens = [];

  gloss.forEach((raw, token) => {
    const isFs = raw.startsWith("FS-");
    const word = isFs ? raw.slice(3) : raw;
    const sign = !isFs && normalize(signs[word], secs);

    if (sign) {
      items.push({ ...withTrim(sign), token });
      tokens.push({ label: word, status: "sign" });
      return;
    }
    // Spell the word letter by letter, defaulting to clips/alphabet/<LETTER>.png
    const dir = lexicon.alphabetDir ?? "clips/alphabet/";
    const ext = lexicon.alphabetExt ?? ".png";
    const letters = [...word]
      .filter((c) => /[A-Z0-9]/.test(c))
      .map((c) => normalize(alphabet[c] ?? `${dir}${c}${ext}`, lexicon.letterSeconds ?? secs));
    if (letters.length) {
      letters.forEach((l) => items.push({ ...withTrim(l), token, fs: true }));
      tokens.push({ label: isFs ? raw : `FS-${word}`, status: "fs" });
    } else {
      tokens.push({ label: word, status: "missing" });
    }
  });
  return { items, tokens };
}