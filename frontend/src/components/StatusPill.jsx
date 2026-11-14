const STYLES = {
  live: "bg-verified/10 text-verified border-verified/30",
  limited: "bg-amber/10 text-amber border-amber/30",
  onboarding: "bg-signal/10 text-signal-dark border-signal/30",
  coming_soon: "bg-ink/5 text-ink/50 border-line",
};

const LABELS = {
  live: "Live",
  limited: "Limited",
  onboarding: "Onboarding",
  coming_soon: "Coming soon",
};

export default function StatusPill({ status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${STYLES[status] || STYLES.coming_soon}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {LABELS[status] || status}
    </span>
  );
}
