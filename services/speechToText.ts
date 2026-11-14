export function startListening(onResult: (text: string) => void) {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) return;
  const rec = new SpeechRecognition();
  rec.continuous = true;
  rec.onresult = (e: any) => {
    const text = e.results[e.results.length - 1][0].transcript;
    onResult(text);
  };
  rec.start();
  return rec;
}