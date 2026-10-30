export default function Loading() {
  return (
    <div className="page">
      <div
        className="skeleton"
        style={{ height: 60, width: "60%", marginBottom: 32 }}
      />
      <div className="skeleton" style={{ height: 320 }} />
      <div className="tournament-grid" style={{ marginTop: 32 }}>
        {[1, 2, 3].map((x) => (
          <div key={x} className="skeleton" style={{ height: 340 }} />
        ))}
      </div>
    </div>
  );
}
