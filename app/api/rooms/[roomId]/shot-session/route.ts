import { NextRequest } from "next/server";
import { startShotRoute } from "../../../start-shot-routes";

export function PUT(request: NextRequest, context: { params: Promise<{ roomId: string }> }) {
  return startShotRoute("select", request, context);
}
