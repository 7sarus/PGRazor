// A subtle route line with waypoint nodes — the project's own motif rather than
// a stock gradient blob. Purely decorative; coloured via currentColor in CSS.
export default function RouteMotif({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 640 420"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="route-line"
        d="M-30 330 C 110 330 150 150 300 170 S 520 300 680 110"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 11"
        strokeLinecap="round"
      />
      <circle className="route-node" cx="110" cy="286" r="4" />
      <circle className="route-node" cx="300" cy="170" r="5.5" />
      <circle className="route-node" cx="498" cy="214" r="4" />
    </svg>
  );
}
