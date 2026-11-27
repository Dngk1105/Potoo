import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { AccessToken } from "livekit-server-sdk";
import nextEnv from "@next/env";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
nextEnv.loadEnvConfig(root);
const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;
if (!apiKey || !apiSecret) throw new Error("Missing local LiveKit API configuration");
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
if (!fs.existsSync(edge)) throw new Error("Microsoft Edge was not found");
const roomId = randomUUID();
const identities = { host: `test-host-${randomUUID()}`, member: `test-member-${randomUUID()}` };
async function createToken(role) {
  const token = new AccessToken(apiKey, apiSecret, {
    identity: identities[role],
    attributes: { role },
    ttl: 120,
  });
  token.addGrant({
    room: roomId,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: false,
  });
  return token.toJwt();
}
const tokens = { host: await createToken("host"), member: await createToken("member") };
const compile = (file) =>
  ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
const modules = {
  "/realtime.js": compile("core/adapters/real/realtime.ts").replace(
    '"./room-packet"',
    '"./room-packet.js"',
  ),
  "/room-packet.js": compile("core/adapters/real/room-packet.ts"),
};
const umd = fs.readFileSync(
  path.join(root, "node_modules/livekit-client/dist/livekit-client.umd.js"),
);
const script = `
import { createRealRealtime } from '/realtime.js';
const role = new URL(location.href).searchParams.get('role');
const check = (ok, message) => { if (!ok) throw Error(message); };
const wait = async (predicate, message) => {
  const end = Date.now() + 20000;
  while (Date.now() < end) { if (await predicate()) return; await new Promise(r => setTimeout(r, 100)); }
  throw Error(message);
};
async function main() {
  const fixture = await (await fetch('/fixture?role=' + role)).json();
  const payload = {sessionId:'10000000-0000-4000-8000-000000000001', requestId:'10000000-0000-4000-8000-000000000002', round:1, delayMs:100};
  const sender = {identity:fixture.host,role:'host'};
  const api = createRealRealtime({
    getCredentials: async () => ({url:'ws://127.0.0.1:7880',token:fixture.token}),
    issueStartShot: async () => 'fixture-envelope',
    preverifyStartShot: async (_room, envelope) => { if (envelope !== 'fixture-envelope') throw Error('bad fixture'); },
    verifyStartShot: async (_room, envelope) => { if (envelope !== 'fixture-envelope') throw Error('bad fixture'); return {payload,sender}; },
  });
  const received = { ready:false, changed:false, shot:false };
  api.bus.on('READY', (value, from) => { if (from.identity === fixture.host && value.ready) received.ready = true; });
  api.bus.on('ROOM_CHANGED', (_value, from) => { if (from.identity === fixture.member) received.changed = true; });
  api.bus.on('START_SHOT', (value, from) => { if (from.identity === fixture.host && value.requestId === payload.requestId) received.shot = true; });
  await api.room.join({roomId:fixture.room});
  await wait(() => api.room.participants().length === 2, 'participants did not converge');
  const participants = api.room.participants();
  check(participants.some(p => p.identity === fixture.host && p.attributes.role === 'host'), 'missing host role');
  check(participants.some(p => p.identity === fixture.member && p.attributes.role === 'member'), 'missing member role');
  await fetch('/ready?role=' + role);
  await wait(async () => (await (await fetch('/ready')).json()).both, 'readiness timeout');
  let stream;
  if(role === 'host') {
    stream = await navigator.mediaDevices.getUserMedia({video:true,audio:false});
    await api.room.publishTrack(stream.getVideoTracks()[0]);
    await api.bus.send({type:'READY',payload:{ready:true}});
    await api.bus.send({type:'START_SHOT',payload});
    await wait(() => received.changed && received.shot, 'host event timeout');
  } else {
    await api.bus.send({type:'ROOM_CHANGED'});
    await wait(() => received.ready && received.shot, 'member event timeout');
    await wait(() => api.room.remoteTracks().length > 0, 'remote track timeout');
    const remote = api.room.remoteTracks()[0];
    check(remote.participantIdentity === fixture.host, 'remote identity mismatch');
    const video = document.getElementById('remote');
    remote.attach(video);
    await video.play();
    await wait(() => video.videoWidth > 0 && video.currentTime > 0, 'remote video did not play');
    remote.detach(video);
  }
  await fetch('/result', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role,ok:true})});
  await wait(async () => (await (await fetch('/result-state')).json()).both, 'peer result timeout');
  await api.room.leave();
  stream?.getTracks().forEach(track => track.stop());
  await fetch('/left?role=' + role);
}
main().catch(async error => { await fetch('/result',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role,ok:false,error:String(error.message || error)})}); });
`;
const ready = new Set();
const results = new Map();
const left = new Set();
const profiles = [];
const browsers = [];
let finished = false;
let exitCode = 1;
const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  const role = url.searchParams.get("role");
  if (url.pathname === "/livekit.js") {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end(umd);
    return;
  }
  if (url.pathname === "/livekit-shim.js") {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end("export const { Room, RoomEvent } = window.LivekitClient;");
    return;
  }
  if (url.pathname === "/test.js") {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end(script);
    return;
  }
  if (modules[url.pathname]) {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end(modules[url.pathname]);
    return;
  }
  if (url.pathname === "/fixture" && (role === "host" || role === "member")) {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(
      JSON.stringify({
        token: tokens[role],
        room: roomId,
        host: identities.host,
        member: identities.member,
      }),
    );
    return;
  }
  if (url.pathname === "/ready") {
    if (role === "host" || role === "member") ready.add(role);
    response.end(JSON.stringify({ both: ready.size === 2 }));
    return;
  }
  if (url.pathname === "/result-state") {
    response.end(JSON.stringify({ both: results.size === 2 }));
    return;
  }
  if (url.pathname === "/left") {
    if (role === "host" || role === "member") left.add(role);
    response.end("ok");
    if (left.size === 2) finish(0);
    return;
  }
  if (url.pathname === "/result" && request.method === "POST") {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        const result = JSON.parse(body);
        if (
          (result.role !== "host" && result.role !== "member") ||
          typeof result.ok !== "boolean"
        ) {
          response.statusCode = 400;
          response.end();
          finish(1);
          return;
        }
        response.end("ok");
        results.set(result.role, result);
        if (!result.ok) {
          // Browser errors may contain credentials in URLs; report only the test phase.
          console.error(`${result.role}: browser integration failed`);
          finish(1);
        }
      } catch {
        response.statusCode = 400;
        response.end();
        finish(1);
      }
    });
    return;
  }
  response.writeHead(200, { "content-type": "text/html" });
  response.end(
    '<!doctype html><title>LiveKit local test</title><video id="remote" width="320" height="240" autoplay muted playsinline></video><script src="/livekit.js"></script><script type="importmap">{"imports":{"livekit-client":"/livekit-shim.js"}}</script><script type="module" src="/test.js"></script>',
  );
});
function finish(code) {
  if (finished) return;
  finished = true;
  exitCode = code;
  server.close();
  for (const browser of browsers) if (browser.exitCode === null) browser.kill();
  Promise.all(
    browsers.map((browser) =>
      browser.exitCode === null
        ? new Promise((resolve) => browser.once("exit", resolve))
        : Promise.resolve(),
    ),
  ).then(() => {
    for (const profile of profiles) {
      try {
        fs.rmSync(profile, { recursive: true, force: true });
      } catch {
        exitCode = 1;
        console.error("Could not remove temporary browser profile");
      }
    }
    if (exitCode === 0)
      console.log(
        "PASS: two LiveKit participants, reliable events, fake camera and remote video; START_SHOT verifier mocked",
      );
    process.exit(exitCode);
  });
}
server.listen(0, "127.0.0.1", () => {
  for (const role of ["host", "member"]) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), `potoo-livekit-${role}-`));
    profiles.push(profile);
    const browser = spawn(
      edge,
      [
        "--headless=new",
        "--disable-gpu",
        "--disable-background-networking",
        "--no-first-run",
        "--autoplay-policy=no-user-gesture-required",
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--user-data-dir=${profile}`,
        `http://127.0.0.1:${server.address().port}/?role=${role}`,
      ],
      { stdio: "ignore" },
    );
    browsers.push(browser);
    browser.on("error", () => {
      console.error(`${role}: browser launch failed`);
      finish(1);
    });
    browser.on("exit", (code) => {
      if (!finished) {
        console.error(`${role}: browser exited early (${code})`);
        finish(1);
      }
    });
  }
  setTimeout(() => {
    if (!finished) {
      console.error("LiveKit browser test timed out");
      finish(1);
    }
  }, 45000).unref();
});
