import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "potoo-ed25519-test-"));
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const message = "potoo:start-shot:v2:test:fixture";
const key = publicKey.export({ type: "spki", format: "der" }).toString("base64url");
const signature = sign(null, Buffer.from(message), privateKey).toString("base64url");
const roomId = "10000000-0000-4000-8000-000000000001";
const keyId = createHash("sha256")
  .update(Buffer.from(key, "base64url"))
  .digest("base64url")
  .slice(0, 16);
const inner = `${Buffer.from(JSON.stringify({ roomId })).toString("base64url")}.${Buffer.alloc(32).toString("base64url")}`;
const encoded = Buffer.from(inner).toString("base64url");
const signedBytes = Buffer.from(`potoo:start-shot:v2:${keyId}:${encoded}`);
const envelope = `2.${keyId}.${encoded}.${sign(null, signedBytes, privateKey).toString("base64url")}`;
const rotated = generateKeyPairSync("ed25519");
const rotatedKey = rotated.publicKey.export({ type: "spki", format: "der" }).toString("base64url");
const rotatedKeyId = createHash("sha256")
  .update(Buffer.from(rotatedKey, "base64url"))
  .digest("base64url")
  .slice(0, 16);
const rotatedMessage = Buffer.from(`potoo:start-shot:v2:${rotatedKeyId}:${encoded}`);
const rotatedEnvelope = `2.${rotatedKeyId}.${encoded}.${sign(null, rotatedMessage, rotated.privateKey).toString("base64url")}`;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const transport = ts.transpileModule(
  fs.readFileSync(path.join(root, "core/adapters/real/start-shot-http.ts"), "utf8"),
  {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  },
).outputText;
let browser;
let finished = false;
const server = http.createServer((request, response) => {
  if (request.url === "/start-shot-http.js") {
    response.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" });
    response.end(transport);
    return;
  }
  if (request.url === "/result" && request.method === "POST") {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      response.end("ok");
      finished = true;
      const result = JSON.parse(body);
      console.log(JSON.stringify(result));
      cleanup(result.ok ? 0 : 1);
    });
    return;
  }
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(`<!doctype html><title>Ed25519 test</title><script type="module">
    import { createStartShotHttp } from '/start-shot-http.js';
    const decode = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-s.length%4)%4)), c => c.charCodeAt(0));
    try {
      const key = await crypto.subtle.importKey('spki', decode(${JSON.stringify(key)}), {name:'Ed25519'}, false, ['verify']);
      const signature = decode(${JSON.stringify(signature)});
      const valid = await crypto.subtle.verify('Ed25519', key, signature, new TextEncoder().encode(${JSON.stringify(message)}));
      const tampered = await crypto.subtle.verify('Ed25519', key, signature, new TextEncoder().encode('tampered'));
      let currentKey = {version:2,kid:${JSON.stringify(keyId)},publicKey:${JSON.stringify(key)}};
      let keyFetches = 0;
      const api = createStartShotHttp(async () => { keyFetches++; return Response.json(currentKey); });
      await api.preverifyStartShot(${JSON.stringify(roomId)}, ${JSON.stringify(envelope)});
      let rejectsTampered = false, rejectsWrongRoom = false;
      try { await api.preverifyStartShot(${JSON.stringify(roomId)}, ${JSON.stringify(envelope)} + 'A'); } catch { rejectsTampered = true; }
      try { await api.preverifyStartShot('20000000-0000-4000-8000-000000000002', ${JSON.stringify(envelope)}); } catch { rejectsWrongRoom = true; }
      currentKey = {version:2,kid:${JSON.stringify(rotatedKeyId)},publicKey:${JSON.stringify(rotatedKey)}};
      await api.preverifyStartShot(${JSON.stringify(roomId)}, ${JSON.stringify(rotatedEnvelope)});
      const rotated = keyFetches === 2;
      await fetch('/result', {method:'POST', body:JSON.stringify({ok:valid && !tampered && rejectsTampered && rejectsWrongRoom && rotated, valid, tampered, adapterValid:true, rejectsTampered, rejectsWrongRoom, rotated})});
    } catch (error) {
      await fetch('/result', {method:'POST', body:JSON.stringify({ok:false,error:String(error)})});
    }
  </script>`);
});
function cleanup(code) {
  server.close();
  const remove = () => {
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch (error) {
      console.error("Profile retained:", profile, error.message);
      code = 1;
    }
    process.exit(code);
  };
  if (browser && browser.exitCode === null) {
    browser.once("exit", remove);
    browser.kill();
  } else remove();
}
server.listen(0, "127.0.0.1", () => {
  browser = spawn(
    edge,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--no-first-run",
      `--user-data-dir=${profile}`,
      `http://127.0.0.1:${server.address().port}/`,
    ],
    { stdio: "ignore" },
  );
  browser.on("error", (error) => {
    console.error(error.message);
    cleanup(1);
  });
  browser.on("exit", (code) => {
    if (!finished) {
      console.error("Browser exited before result:", code);
      cleanup(1);
    }
  });
  setTimeout(() => {
    if (!finished) {
      console.error("Timed out waiting for browser");
      cleanup(1);
    }
  }, 30000).unref();
});
