"use client";

export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;
  return (
    <div style={{ padding: 32 }} role="alert">
      <div className="adm-card adm-stack" style={{ maxWidth: 480 }}>
        <h1 className="adm-title">Something went wrong</h1>
        <p className="adm-muted">
          This page couldn&apos;t load.{digest && <> Reference: <span className="adm-mono">{digest}</span></>}
        </p>
        <div className="adm-row">
          <button type="button" className="adm-btn adm-btn--primary" onClick={() => retry()}>
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
