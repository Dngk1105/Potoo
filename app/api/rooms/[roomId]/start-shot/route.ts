import { NextRequest } from "next/server";
import { startShotRoute } from "../../../start-shot-routes";

export function POST(request: NextRequest, context: { params: Promise<{ roomId: string }> }) {
  return startShotRoute("issue", request, context);
}
