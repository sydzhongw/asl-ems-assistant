import { useEffect, useRef, useState } from "react";

// Clips live in public/signs/<phrase_id>.mp4 (served at /signs/...).
// Change this one line if your clips are served from somewhere else.
const CLIP_BASE = "/signs";

type Props = { phraseId: string | null; label?: string };

export default function SignerVideo({ phraseId, label = "ASL Signer" }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const src = phraseId ? `${CLIP_BASE}/${phraseId}.mp4` : null;

  useEffect(() => setFailed(false), [src]);

  const replay = () => {
    if (!ref.current) return;
    ref.current.currentTime = 0;
    ref.current.play().catch(() => {});
  };

  return (
    <div style={{ position: "relative", aspectRatio: "16 / 9", background: "#1c2433", borderRadius: 16, overflow: "hidden" }}>
      <span style={{ position: "absolute", top: 12, left: 12, zIndex: 1, padding: "4px 12px", borderRadius: 999, background: "#0f1520", color: "#9ad7ff", fontSize: 14 }}>
        {label}
      </span>
      {src && !failed ? (
        <>
          {/* objectFit contain keeps the signer's hands and face fully visible */}
          <video ref={ref} key={src} src={src} autoPlay muted playsInline onError={() => setFailed(true)}
            style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          <button onClick={replay}
            style={{ position: "absolute", bottom: 12, right: 12, minHeight: 44, padding: "0 16px", borderRadius: 999, border: 0, background: "#4fb99a", color: "#06251d", fontWeight: 600, cursor: "pointer" }}>
            Replay
          </button>
        </>
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", color: "#cbd5e1", fontSize: 18 }}>
          {failed ? "Clip not found. Request a human interpreter." : "ASL signer ready"}
        </div>
      )}
    </div>
  );
}