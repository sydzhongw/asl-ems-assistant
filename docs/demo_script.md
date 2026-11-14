# SignLink EMS: Demo Script (2:00)

**Pitch in one line:** SignLink EMS puts an ASL signer in the call between a culturally Deaf patient and EMS, so help doesn't depend on reading English. It only translates. It never asks questions or gives medical advice.

**Cast**
- **Maria** (patient): a culturally Deaf ASL signer. Ideally played by a fluent signer.
- **EMS responder:** a teammate on a laptop (simulated, never a real 911 call).
- **Voiceover:** recorded last, after filming.

**Rules for filming**
- Only demo phrases that are in `data/lexicon.json` and work reliably.
- Put a small caption on screen during the demo: *Prototype: simulated EMS.*
- Never place real calls or texts to 911, even for testing.
- Have someone fluent in ASL check every sign and signer clip, and credit the signer in the video.
- Say "many" and "may," not "all." Don't state statistics unless we have a source.
- Record a clean backup run of the full demo path.

---

## Timeline

| Time | Part | Goal |
|---|---|---|
| 0:00-0:15 | Problem | Make the pain felt |
| 0:15-0:30 | Status quo | Show why this isn't solved |
| 0:30-1:40 | Solution | One path that proves it works |
| 1:40-2:00 | Future and impact | Short and aspirational |

---

## 0:00-0:15 | The problem

**Visual:** No title card. Maria on the couch, hand on her chest, breathing hard. She grabs her phone and stares at a blank text box. Someone beside her doesn't sign and can only watch. Hold on her face for a beat.

**Voiceover:**
> This is Maria. She's culturally Deaf. ASL is her first language, and English is her second. Right now her chest is tight, and every second she can't explain what's wrong is a second she doesn't have.

---

## 0:15-0:30 | The status quo

**Visual:** Four quick cards, about 3 seconds each. The first three are the same layout:

1. **Texting 911** with a red label: *English required*
2. **Typing** with a red label: *English required*
3. **Writing notes** with a red label: *English required*
4. Maria, still waiting, with the caption: *We're here to close the gap.*

**Voiceover:**
> Texting, typing, writing notes: every one of these demands English. For many culturally Deaf people, that's a wall. Video interpreters help, but they have to be available and on the line. We're here to close the gap.

**Notes**
- Be fair to video relay interpreters. They work in sign language. Our point is that they need to be available and connected. Don't claim wait times or shortages without a source.
- We support interpreters, not replace them.

---

## 0:30-1:40 | The solution

**Visual:** Screen recording plus Maria. Caption: *Prototype: simulated EMS.*

| Time | On screen | Audio |
|---|---|---|
| 0:30-0:38 | Maria taps **Start Call**. The EMS screen shows **Connected** and the timer starts. | VO: "SignLink EMS puts a signer in the call. It only translates. It never gives medical advice." |
| 0:38-0:55 | EMS says "What's your emergency?" The English appears on the EMS screen, and the **signer plays** on Maria's phone. | EMS: "What's your emergency?" |
| 0:55-1:15 | Maria signs CHEST + PAIN. **"My chest hurts"** appears for EMS. The app **signs it back** to Maria, and she taps thumbs-up to confirm. | VO: "Maria signs. EMS reads it in English. Before anything is trusted, the app signs it back to her to confirm." |
| 1:15-1:35 | EMS: "Are you having trouble breathing?" The signer plays. Maria signs YES. EMS says "Help is on the way," and the signer plays that too. Maria's face relaxes. | EMS: "Are you having trouble breathing?" ... "Help is on the way." |
| 1:35-1:40 | EMS taps **End Call**. | A quiet beat. |

**On-screen text for the whole section:** *No reading required.*

---

## 1:40-2:00 | Future and impact

**Visual:** Architecture diagram for about 8 seconds, then the Gemini, Cursor, and Entire logos, then team names. Final card: **SignLink EMS. Help, in your language.**

**Voiceover:**
> We built this with Gemini, Cursor, and Entire. Next, we'd work with Deaf consultants, certified interpreters, and emergency services, because help shouldn't depend on reading English.

---

## Checklist before filming

**App**
- [ ] Camera tile label says **Patient** on the EMS screen and **You** on the patient's screen
- [ ] Signer tile says **ASL Signer** if it plays real-signer clips (not "AI ASL Interpreter")
- [ ] Patient confirmation is a **signed replay with a thumbs-up**, not English text (the patient may not read English)
- [ ] Home button says **Call EMS** (or keep **Start Call** and say it's a call to EMS in the voiceover)
- [ ] Every phrase used in the demo is in `data/lexicon.json`, including a clip for "my chest hurts"

**Filming**
- [ ] Rehearse the exact demo path until it works every time
- [ ] Screen record with Cmd+Shift+5
- [ ] Film the role-play on a phone, plain background, good light, 2 or 3 takes per scene
- [ ] Record the voiceover last and listen back
- [ ] Add captions, keep it under 2:00, export 1080p MP4
- [ ] Check the hackathon's length limit and upload instructions
- [ ] Record a clean backup run of the full demo

## Who does what
- **Sydney:** frontend, demo video, docs
- **Lahari:** ASL to English
- **Joanna:** English to ASL, signer clips, `lexicon.json`