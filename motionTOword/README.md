# Voice to Sign

Speech -> text -> ASL gloss -> stitched sign clips, all in the browser.

## Run it

```
cd asl-voice-to-sign
python3 -m http.server 8000
```

Open http://localhost:8000 (the mic and `lexicon.json` need http, not `file://`).
Paste a Gemini API key in the header. Without a key, typing a sentence still works using simple rule-based gloss.

The EMS app serves this player at `/motionTOword/` and embeds it in the call screen. Spoken text that does not match an approved EMS phrase is sent to the embedded player.

## Pipeline

| Step | File | What it does |
|---|---|---|
| Speech to text | `gemini.js` `transcribe()` | Records the mic, converts to 16 kHz WAV, sends to Gemini |
| Text to gloss | `gemini.js` `toGloss()` | Gemini reorders to ASL grammar, choosing words from your lexicon |
| Gloss to clips | `gloss.js` `resolve()` | Looks each token up in `lexicon.json`; unknown words are fingerspelled |
| Stitching | `player.js` | Two alternating `<video>` elements, trimmed by `start`/`end`, no gap between signs |

## lexicon.json

```
{ "signs":    { "HELLO": { "clip": "clips/hello.mp4", "start": 0.2, "end": 1.1 }, "GO": "clips/go.mp4" },
  "alphabet": { "A": "clips/alphabet/A.mp4" } }
```

- An entry is a path, or an object with optional `start`/`end` seconds to trim dead time.
- Tokens with no sign fall back to fingerspelling via `alphabet`. Tokens with neither show as struck-through chips.
- Point your bulk video-to-lexicon script at this format, or adjust `normalize()` in `gloss.js` to match its output.

## Notes

- The API key is used from the browser. Before deploying, proxy the two Gemini calls through your own server.
- Change `MODEL` at the top of `gemini.js` if your key uses a different Gemini model.
- Next step if you want a downloadable result: draw the active video onto a canvas and record it with `MediaRecorder`.
