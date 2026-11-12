/** Icon riêng của phần tin nhắn (không sửa packages/ui để tránh đụng nhánh UI đang làm song song). */
const PATHS = {
  mail: "M3.5 6.5A1.5 1.5 0 0 1 5 5h14a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5zM4.5 7.5l7.5 5.6 7.5-5.6",
  smile: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8.5 14.5a4.6 4.6 0 0 0 7 0M9 9.75h.01M15 9.75h.01",
  keyboard: "M3 7h18v10H3zM7 10h.01M10 10h.01M13 10h.01M16 10h.01M8 14h8",
} as const;

export type DmIconName = keyof typeof PATHS;

export function DmIcon({ name, className = "h-5 w-5" }: { name: DmIconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
