/**
 * A small circular percentage ring — used on the teacher's "My classes" tab
 * to show how much of a class's score entry is done for a subject, and on
 * the admin's "Progress" tab for the same thing across every teacher.
 */
export default function CircularProgress({ percent = 0, size = 44, stroke = 4, label }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const color = pct >= 100 ? "#059669" : pct >= 50 ? "#2563eb" : "#d97706";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} title={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
      </svg>
      <span className="absolute text-[10px] font-bold" style={{ color }}>
        {pct}%
      </span>
    </div>
  );
}
