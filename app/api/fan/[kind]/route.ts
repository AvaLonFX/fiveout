import { NextRequest } from "next/server";
import { fanRoute } from "@/lib/fan-server";
export const runtime = "nodejs";
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ kind: string }> },
) {
  return fanRoute(req, (await context.params).kind);
}
export const POST = GET;
