import { clientConfig } from "@/configs";

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={clientConfig.appName}>
      <rect width="64" height="64" rx="16" fill="var(--accent)" />
      <path
        d="M21 42 32 21l11 21z"
        fill="none"
        stroke="var(--accent-ink)"
        strokeWidth="3.2"
        strokeLinecap="round"
        opacity=".55"
      />
      <g fill="var(--accent-ink)">
        <circle cx="32" cy="21" r="5.5" />
        <circle cx="21" cy="42" r="5.5" />
        <circle cx="43" cy="42" r="5.5" />
      </g>
    </svg>
  );
}
