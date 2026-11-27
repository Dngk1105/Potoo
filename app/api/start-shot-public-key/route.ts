import { NextRequest, NextResponse } from "next/server";
import { withRouteAuth } from "../route-auth";
import { loadStartShotEd25519Key, loadStartShotHmacKey } from "../start-shot-signature";

export async function GET(request: NextRequest) {
  return withRouteAuth(request, async () => {
    const key = loadStartShotEd25519Key(process.env.START_SHOT_ED25519_PRIVATE_KEY);
    if (!key || !loadStartShotHmacKey(process.env.START_SHOT_SIGNING_KEY)) {
      return NextResponse.json(
        { error: { code: "SERVICE_UNAVAILABLE", message: "Service unavailable" } },
        { status: 503 },
      );
    }
    return NextResponse.json({ version: 2, kid: key.kid, publicKey: key.encodedPublicKey });
  });
}
