# ASL EMS Translator

A mobile app that helps EMS responders communicate with culturally Deaf patients who use ASL. It translates English to ASL and ASL to English. The AI only translate. It never asks questions or gives medical advice. 

## How it works 

1. **EMS speaks** --> speech-to-text --> AI matches an approved EMS phrase --> a signer video plays for the patient 
2. **Patient signs** --> camera detects the signs --> AI builds an English sentence --> shown as text and read aloud to EMS 

## Folder structure 

```
|--- app/           # screens (home, call)
|--- components/           # signer video, camera, captions 
|--- services/           # speech-to-text, sign recognition, LLM 
|--- assets/           # ASL video clips 
|--- data/           # EMS phrase list
|--- backend/           # server that talks to AI APIs
|--- docs/           # demo script, architecture diagram 
```

## Setup 

(not finished)

## Team

- Sydney Wang: Frontend (including demo + docs)
- Lahari Durga: ASL --> English 
- Joanna Yu: English --> ASL 

## Notes
