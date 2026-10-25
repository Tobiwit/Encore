import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { cronSecret } from "@/lib/env";
import { isJobName, runJob } from "@/server/jobs";

export const maxDuration = 300;

function authorised(request: NextRequest) {
  const secret = cronSecret();
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Hosted-scheduler entry point (e.g. Vercel Cron). Same jobs as `pnpm worker`. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/cron/[job]">) {
  if (!authorised(request)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const { job } = await ctx.params;
  if (!isJobName(job)) return NextResponse.json({ error: "unknown job" }, { status: 404 });
  const result = await runJob(job);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
