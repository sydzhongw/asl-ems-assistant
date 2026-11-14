// Gloss helpers that don't need the network.

const DROP = new Set(["a", "an", "the", "is", "are", "am", "was", "were", "be", "been", "to", "of", "do", "does", "did"]);
const TIME = new Set(["tomorrow", "yesterday", "today", "tonight", "now", "later"]);
const WH = new Set(["who", "what", "where", "why", "how", "when"]);

// Rough rule-based gloss used when no API key is set (demo mode).
export function fallbackGloss(text) {
  const words = text.toLowerCase().replace(/[^a-z0-9'\s-]/g, " ").split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => !DROP.has(w));
  const time = kept.filter((w) => TIME.has(w));
  const wh = kept.filter((w) => WH.has(w));
  const rest = kept.filter((w) => !TIME.has(w) && !WH.has(w));
  return [...time, ...rest, ...wh].map((w) => w.toUpperCase());
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
  const items = [];
  const tokens = [];

  gloss.forEach((raw, token) => {
    const isFs = raw.startsWith("FS-");
    const word = isFs ? raw.slice(3) : raw;
    const sign = !isFs && normalize(signs[word], secs);

    if (sign) {
      items.push({ ...sign, token });
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
      letters.forEach((l) => items.push({ ...l, token, fs: true }));
      tokens.push({ label: isFs ? raw : `FS-${word}`, status: "fs" });
    } else {
      tokens.push({ label: word, status: "missing" });
    }
  });
  return { items, tokens };
}