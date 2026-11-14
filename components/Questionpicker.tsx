import data from "../data/ems_questions.json";

type Props = { activeId: string | null; onPick: (id: string) => void };

const groups = [
  { key: "assessment", title: "Patient assessment" },
  { key: "emergency", title: "Emergency questions" },
];

export default function QuestionPicker({ activeId, onPick }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {groups.map((g) => (
        <section key={g.key}>
          <h3 style={{ margin: "0 0 8px", fontSize: 16, color: "#cbd5e1", fontWeight: 600 }}>{g.title}</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {data.phrases.filter((p) => p.category === g.key).map((p) => (
              <button key={p.id} onClick={() => onPick(p.id)}
                style={{
                  minHeight: 44, padding: "0 16px", borderRadius: 999, cursor: "pointer", fontSize: 15,
                  border: p.id === activeId ? "2px solid #4fb99a" : "1px solid #3a4560",
                  background: p.id === activeId ? "#173a30" : "#1c2433", color: "#e2e8f0",
                }}>
                {p.english[0]}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}