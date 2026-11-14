export default function Captions({ text }: { text: string }) {
  return (
    <div className="captions">
      <div className="label">ENGLISH (for EMT)</div>
      <div className="text">{text}</div>
    </div>
  );
}