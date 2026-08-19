const checks = [
  "Bun web process",
  "Next.js page",
  "PostgreSQL health check",
  "WebSocket heartbeat",
  "Independent worker loop",
  "Native host-agent placeholder",
];

export default function Page() {
  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">Phase 0 spike</p>
        <h1>maxxy-me runtime proof</h1>
        <p className="lede">
          This screen exists to prove the deployment shape before product UI
          work begins.
        </p>
        <div className="checks">
          {checks.map((check) => (
            <span key={check}>{check}</span>
          ))}
        </div>
      </section>
    </main>
  );
}
