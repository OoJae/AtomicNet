// Dismissible inline error banner (institutional style — no browser alert popups).
export function ErrorBanner({ message, onDismiss }: { message?: string; onDismiss: () => void }) {
  if (!message) return null;
  return (
    <div
      className="banner"
      role="alert"
      style={{ background: "var(--neg-soft)", color: "var(--neg)", borderColor: "#fecaca", display: "flex", alignItems: "center", gap: 10 }}
    >
      <span style={{ flex: 1 }}>{message}</span>
      <button className="btn sm" onClick={onDismiss} style={{ borderColor: "#fecaca", color: "var(--neg)" }}>
        Dismiss
      </button>
    </div>
  );
}
