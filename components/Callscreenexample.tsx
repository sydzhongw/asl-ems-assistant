import { useState } from "react";
import data from "../data/ems_questions.json";
import SignerVideo from "../components/SignerVideo";
import QuestionPicker from "../components/Questionpicker";

const byId: Record<string, { english: string[] }> = Object.fromEntries(data.phrases.map((p) => [p.id, p]));

export default function CallScreenExample() {
  const [phraseId, setPhraseId] = useState<string | null>(null);
  const [heard, setHeard] = useState("");
  const [note, setNote] = useState("");

  // Speech path: browser speech to text, then the backend asks Gemini to pick an approved phrase.
  const listen = () => {
    const Rec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Rec) return setNote("Speech is not supported in this browser. Tap a question instead.");
    const rec = new Rec();
    rec.lang = "en-US";
    rec.onresult = async (e: any) => {
      const text: string = e.results[0][0].transcript;
      setHeard(text);
      try {
        const res = await fetch("/api/english-to-asl", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
        });
        const { phrase_id, confidence } = await res.json();
        if (phrase_id && confidence >= 0.7) { setPhraseId(phrase_id); setNote(""); }
        else { setPhraseId(null); setNote("No approved phrase matched. Tap a question or request a human interpreter."); }
      } catch {
        setNote("Could not reach the server. Tap a question instead.");
      }
    };
    rec.start();
  };

  const shown = phraseId ? byId[phraseId].english[0] : heard || "Waiting for speech or a tapped question";

  return (
    <div style={{ minHeight: "100vh", background: "#0b1220", color: "#e2e8f0", padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <div style={{ aspectRatio: "16 / 9", borderRadius: 16, background: "#1c2433", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ad7ff" }}>
          Patient camera
        </div>
        <SignerVideo phraseId={phraseId} />
      </div>

      <div style={{ padding: 16, borderRadius: 16, background: "#111a2b" }}>
        <div style={{ fontSize: 14, color: "#4fb99a" }}>English for EMS</div>
        <div style={{ fontSize: 28, fontWeight: 600 }}>{shown}</div>
        {note && <div style={{ marginTop: 8, color: "#fbbf24" }}>{note}</div>}
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <button onClick={listen} style={{ minHeight: 48, padding: "0 24px", borderRadius: 999, border: 0, background: "#4fb99a", color: "#06251d", fontWeight: 700, cursor: "pointer" }}>
          Speak
        </button>
      </div>

      <QuestionPicker activeId={phraseId} onPick={(id) => { setPhraseId(id); setHeard(""); setNote(""); }} />
    </div>
  );
}