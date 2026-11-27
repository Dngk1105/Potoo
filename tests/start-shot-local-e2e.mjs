import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes, randomInt, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { AccessToken } from "livekit-server-sdk";
import nextEnv from "@next/env";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
nextEnv.loadEnvConfig(root);
const {
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
  SUPABASE_SECRET_KEY: adminKey,
  LIVEKIT_API_KEY: livekitKey,
  LIVEKIT_API_SECRET: livekitSecret,
} = process.env;
if (!supabaseUrl || !publicKey || !adminKey || !livekitKey || !livekitSecret)
  throw new Error("Missing local test configuration");
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(supabaseUrl).hostname))
  throw new Error("Test requires local Supabase");
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
if (!fs.existsSync(edge)) throw new Error("Microsoft Edge was not found");
const admin = createClient(supabaseUrl, adminKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const users = [];
let roomId;
let web;
let harness;
const browsers = [];
const profiles = [];
let phase = "initialization";
const stop = (child) =>
  new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once("exit", resolve);
    child.kill();
  });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}
async function createFixtureUser(role) {
  const email = `shot-e2e-${role}-${randomUUID()}@example.com`;
  const password = `${randomUUID()}Aa1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Could not create test user");
  const user = { id: created.data.user.id, role };
  users.push(user);
  const client = createClient(supabaseUrl, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw new Error("Could not authenticate test user");
  user.access = signedIn.data.session.access_token;
  return user;
}
async function livekitToken(user) {
  const token = new AccessToken(livekitKey, livekitSecret, {
    identity: user.id,
    attributes: { role: user.role },
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
  "/start-shot-http.js": compile("core/adapters/real/start-shot-http.ts"),
};
const umd = fs.readFileSync(
  path.join(root, "node_modules/livekit-client/dist/livekit-client.umd.js"),
);
const script = `
import {createRealRealtime} from '/realtime.js';
import {createStartShotHttp} from '/start-shot-http.js';
const role = new URL(location.href).searchParams.get('role');
const wait = async (predicate, message) => { const end=Date.now()+30000; while(Date.now()<end){if(await predicate())return; await new Promise(r=>setTimeout(r,100));} throw Error(message); };
async function main(){
 const fixture=await (await fetch('/fixture?role='+role)).json();
 const authenticatedFetch=(input, init={})=>{const headers=new Headers(init.headers); headers.set('Authorization','Bearer '+fixture.access); return fetch(input,{...init,headers});};
 const shot=createStartShotHttp(authenticatedFetch);
 let issued;
 const room=createRealRealtime({
  getCredentials:async()=>({url:'ws://127.0.0.1:7880',token:fixture.livekit}),
  issueStartShot:async(roomId,payload)=>{issued=await shot.issueStartShot(roomId,payload);return issued;},
  preverifyStartShot:shot.preverifyStartShot,
  verifyStartShot:shot.verifyStartShot,
 });
 let count=0;
 room.bus.on('START_SHOT',(payload,sender)=>{if(payload.sessionId===fixture.session && payload.round===0 && sender.identity===fixture.host && sender.role==='host') count++;});
 await room.room.join({roomId:fixture.room});
 await wait(()=>room.room.participants().length===2,'participants');
 await fetch('/ready?role='+role);
 await wait(async()=>(await(await fetch('/ready')).json()).both,'readiness');
 if(role==='host'){
  await shot.selectSession(fixture.room,fixture.session);
  await room.bus.send({type:'START_SHOT',payload:{sessionId:fixture.session,requestId:fixture.request,round:0,delayMs:100}});
 }
 await wait(()=>count===1,'signed event');
 await fetch('/result',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role,ok:true})});
 await wait(async()=>(await(await fetch('/result-state')).json()).both,'result');
 await room.room.leave();
 await fetch('/left?role='+role);
}
main().catch(async()=>{await fetch('/result',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role,ok:false})});});
`;
let resultResolve;
let resultReject;
const done = new Promise((resolve, reject) => {
  resultResolve = resolve;
  resultReject = reject;
});
const ready = new Set();
const results = new Set();
const left = new Set();
try {
  phase = "creating local test users";
  const host = await createFixtureUser("host");
  const member = await createFixtureUser("member");
  phase = "creating local room and session";
  for (let i = 0; i < 32 && !roomId; i++) {
    const pin = String(randomInt(0, 1000000)).padStart(6, "0");
    const result = await admin.rpc("k405_create_room", { p_actor: host.id, p_pin: pin });
    if (!result.error && typeof result.data === "string") roomId = result.data;
    else if (result.error?.code !== "23505") throw new Error("Could not create test room");
  }
  if (!roomId) throw new Error("Could not allocate test room");
  const joined = await admin.rpc("k405_join_room", {
    p_actor: member.id,
    p_room_id: roomId,
    p_pin: null,
  });
  if (joined.error || joined.data?.roomId !== roomId) throw new Error("Could not add test member");
  const sessionId = randomUUID();
  const session = await admin
    .from("sessions")
    .insert({ id: sessionId, room_id: roomId, started_at: new Date().toISOString() });
  if (session.error) throw new Error("Could not create test session");
  const requestId = randomUUID();
  host.livekit = await livekitToken(host);
  member.livekit = await livekitToken(member);
  phase = "starting local application";
  const port = await freePort();
  const privateKey = generateKeyPairSync("ed25519")
    .privateKey.export({ type: "pkcs8", format: "der" })
    .toString("base64url");
  web = spawn(
    process.execPath,
    [
      path.join(root, "node_modules/next/dist/bin/next"),
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      String(port),
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        START_SHOT_SIGNING_KEY: randomBytes(32).toString("base64url"),
        START_SHOT_ED25519_PRIVATE_KEY: privateKey,
      },
      stdio: "ignore",
    },
  );
  web.once("error", () => resultReject(new Error("Application could not start")));
  let started = false;
  for (let i = 0; i < 100; i++) {
    if (web.exitCode !== null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) {
        started = true;
        break;
      }
    } catch {
      /* Wait for the local server. */
    }
    await delay(100);
  }
  if (!started) throw new Error("Application did not start");
  phase = "testing browser flow";
  harness = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const role = url.searchParams.get("role");
    if (url.pathname === "/livekit.js") {
      res.writeHead(200, { "content-type": "text/javascript" });
      res.end(umd);
      return;
    }
    if (url.pathname === "/livekit-shim.js") {
      res.writeHead(200, { "content-type": "text/javascript" });
      res.end("export const {Room,RoomEvent}=window.LivekitClient;");
      return;
    }
    if (url.pathname === "/test.js") {
      res.writeHead(200, { "content-type": "text/javascript" });
      res.end(script);
      return;
    }
    if (modules[url.pathname]) {
      res.writeHead(200, { "content-type": "text/javascript" });
      res.end(modules[url.pathname]);
      return;
    }
    if (url.pathname === "/fixture" && (role === "host" || role === "member")) {
      const user = role === "host" ? host : member;
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(
        JSON.stringify({
          room: roomId,
          session: sessionId,
          request: requestId,
          host: host.id,
          access: user.access,
          livekit: user.livekit,
        }),
      );
      return;
    }
    if (url.pathname === "/ready") {
      if (role === "host" || role === "member") ready.add(role);
      res.end(JSON.stringify({ both: ready.size === 2 }));
      return;
    }
    if (url.pathname === "/result-state") {
      res.end(JSON.stringify({ both: results.size === 2 }));
      return;
    }
    if (url.pathname === "/left") {
      if (role === "host" || role === "member") left.add(role);
      res.end("ok");
      if (left.size === 2) resultResolve();
      return;
    }
    if (url.pathname === "/result" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        try {
          const value = JSON.parse(body);
          res.end("ok");
          if (!value.ok)
            resultReject(
              new Error(`Browser flow failed: ${value.role === "host" ? "host" : "member"}`),
            );
          else if (value.role === "host" || value.role === "member") results.add(value.role);
        } catch {
          res.statusCode = 400;
          res.end();
          resultReject(new Error("Invalid browser result"));
        }
      });
      return;
    }
    if (
      url.pathname.startsWith(`/api/rooms/${roomId}/`) ||
      url.pathname === "/api/start-shot-public-key"
    ) {
      const chunks = [];
      req.on("data", (chunk) => {
        chunks.push(chunk);
      });
      req.on("end", async () => {
        try {
          const headers = new Headers();
          if (req.headers.authorization) headers.set("authorization", req.headers.authorization);
          if (req.headers["content-type"]) headers.set("content-type", req.headers["content-type"]);
          const method = req.method || "GET";
          const upstream = await fetch(`http://127.0.0.1:${port}${url.pathname}`, {
            method,
            headers,
            ...(method === "GET" ? {} : { body: Buffer.concat(chunks) }),
          });
          if (!upstream.ok) console.error(`Local API returned ${upstream.status}`);
          res.writeHead(upstream.status, {
            "content-type": upstream.headers.get("content-type") || "application/json",
            "cache-control": "no-store",
          });
          res.end(Buffer.from(await upstream.arrayBuffer()));
        } catch {
          if (!res.headersSent) res.writeHead(503);
          res.end();
        }
      });
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(
      '<!doctype html><title>Local shot test</title><script src="/livekit.js"></script><script type="importmap">{"imports":{"livekit-client":"/livekit-shim.js"}}</script><script type="module" src="/test.js"></script>',
    );
  });
  await new Promise((resolve, reject) => {
    harness.once("error", reject);
    harness.listen(0, "127.0.0.1", resolve);
  });
  for (const role of ["host", "member"]) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), `potoo-shot-${role}-`));
    profiles.push(profile);
    const browser = spawn(
      edge,
      [
        "--headless=new",
        "--disable-gpu",
        "--disable-background-networking",
        "--no-first-run",
        `--user-data-dir=${profile}`,
        `http://127.0.0.1:${harness.address().port}/?role=${role}`,
      ],
      { stdio: "ignore" },
    );
    browsers.push(browser);
    browser.once("error", () => resultReject(new Error("Browser launch failed")));
    browser.once("exit", () => {
      if (left.size < 2) resultReject(new Error("Browser exited early"));
    });
  }
  let timer;
  try {
    await Promise.race([
      done,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Timed out")), 60000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  console.log(
    "PASS: two browsers, LiveKit local, authenticated START_SHOT routes, Ed25519, DB issue and claim",
  );
} catch {
  console.error(`FAIL: ${phase}`);
  process.exitCode = 1;
} finally {
  await Promise.all(browsers.map(stop));
  if (harness) await new Promise((resolve) => harness.close(resolve));
  await stop(web);
  for (const profile of profiles) {
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      process.exitCode = 1;
      console.error("Could not remove test browser profile");
    }
  }
  if (roomId) {
    try {
      const result = await admin.from("rooms").delete().eq("id", roomId);
      if (result.error) throw result.error;
    } catch {
      process.exitCode = 1;
      console.error(`Could not remove test room ${roomId}`);
    }
  }
  for (const user of users) {
    try {
      const result = await admin.auth.admin.deleteUser(user.id);
      if (result.error) throw result.error;
    } catch {
      process.exitCode = 1;
      console.error(`Could not remove test user ${user.id}`);
    }
  }
}
