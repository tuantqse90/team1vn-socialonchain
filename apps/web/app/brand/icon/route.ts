import { logoSvg } from "@/lib/brand";

export const dynamic = "force-static";

export function GET() {
  return new Response(logoSvg(), {
    headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" },
  });
}
