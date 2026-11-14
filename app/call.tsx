import { useState } from "react";
import Captions from "../components/Captions";
import SignerVideo from "../components/SignerVideo";

export default function Call() {
  const [caption, setCaption] = useState("Waiting for speech...");

  return (
    <div className="call">
      <header>EMS ASL Translator • Connected</header>
      <div className="videos">
        <div className="box">You (EMT Camera)</div>
        <SignerVideo />
      </div>
      <Captions text={caption} />
      <button onClick={() => setCaption("Where does it hurt?")}>
        Simulate Speech
      </button>
    </div>
  );
}