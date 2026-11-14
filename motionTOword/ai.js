// The only file that talks to the AI platform.
// To switch providers, change ENDPOINT, MODEL, the headers, and the response parsing below.
// NOTE: calling the API straight from the browser exposes the key. Fine for a hackathon
// demo; for a deployed app, send this request through your own server instead.

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-5-5"; // fast and cheap; use "claude-sonnet-5-5" for higher quality

const RULES = `You convert English into ASL gloss for a video-clip player.
Rules:
- Output uppercase gloss tokens, one per sign, in ASL word order.
- Drop articles (a, an, the), "to be" verbs, and most prepositions.
- Time first (TOMORROW, YESTERDAY), then topic, then comment. Often Object-Subject-Verb or Subject-Verb-Object, whichever is natural in ASL.
- Put WH-words (WHO, WHAT, WHERE, WHY, HOW) at the end of the question.
- Negation goes after the verb (e.g. I GO-STORE NOT). Use the lemma form of verbs (no -ing, -ed).
- Prefer tokens from the AVAILABLE SIGNS list, using synonyms that exist there when the meaning is the same.
- Proper names or words with no available sign: output FS-WORD (fingerspell), e.g. FS-MARIA.
- Do not add words that were not meant.
Reply with JSON only, no other text: {"gloss": ["TOKEN", "TOKEN"]}`;

export async function toGloss(key, text, vocab) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true", // lets the browser call the API directly
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      system: RULES,
      messages: [{
        role: "user",
        content: `AVAILABLE SIGNS: ${vocab.slice(0, 3000).join(", ")}\n\nEnglish: ${text}`,
      }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const data = await res.json();
  const raw = (data.content ?? []).map((b) => b.text ?? "").join("");
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("no JSON in reply");
  return JSON.parse(json).gloss.map((g) => String(g).trim().toUpperCase()).filter(Boolean);
}