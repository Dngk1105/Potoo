import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "potoo-idb-test-"));
const compile = (file) =>
  ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
const modules = {
  "/storage-queue.js": compile("core/adapters/real/storage-queue.ts"),
  "/supabase-storage.js": compile("core/adapters/real/supabase-storage.ts").replace(
    '"./storage-queue"',
    '"./storage-queue.js"',
  ),
};
const script = `
import { shotQueue } from '/storage-queue.js';
import { createSupabaseStorage } from '/supabase-storage.js';
const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222';
const session='33333333-3333-4333-8333-333333333333';
const pathFor=(u,n)=>'sessions/'+session+'/' + n + '/' + u + '.jpg';
let user=a, mode='offline', remote='';
const checks=[];
function check(condition, name) { if (!condition) throw Error(name); checks.push(name); }
const client={auth:{getSession:async()=>({data:{session:{user:{id:user},access_token:'test-only'}},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},storage:{from:()=>({
 upload:async()=>{if(mode==='offline'){await fetch('/disconnect');} if(mode==='duplicate')return {error:{statusCode:'409'}};return {error:null}},
 setHeader(){},download:async()=>({data:new Blob([remote]),error:null})
})}};
async function main(){
 const phase=new URL(location.href).searchParams.get('phase');
 const port=createSupabaseStorage(client);
 if(!phase){
  const r=await port.upload({bucket:'media',path:pathFor(a,0),body:new Blob(['original'],{type:'image/jpeg'})});
  check(r.ok && r.data.status==='queued','network failure queues shot');
  user=b;
  const s=await port.upload({bucket:'media',path:pathFor(b,0),body:new Blob(['user-b'])});
  check(s.ok && s.data.status==='queued','second user shot queued');
  sessionStorage.setItem('prior',JSON.stringify(checks));
  port.dispose(); location.href='/?phase=reload'; return;
 }
 checks.push(...JSON.parse(sessionStorage.getItem('prior')));
 let aa=await shotQueue.list(a),bb=await shotQueue.list(b);
 check(aa.length===1 && await aa[0].body.text()==='original' && aa[0].body.type==='image/jpeg','reload retains user A Blob and MIME');
 check(bb.length===1 && await bb[0].body.text()==='user-b','reload retains user B Blob');
 user=b; mode='offline';
 let f=await port.flushPending();
 check(f.ok && f.data.failed===1 && (await shotQueue.list(a)).length===1,'offline retry retains both users');
 mode='success'; f=await port.flushPending();
 check(f.ok && f.data.uploaded===1 && (await shotQueue.list(b)).length===0 && (await shotQueue.list(a)).length===1,'flush isolates user B');
 user=a; mode='duplicate'; remote='different'; f=await port.flushPending();
 check(f.ok && f.data.failed===1 && (await shotQueue.list(a)).length===1,'different duplicate retained');
 remote='original'; f=await port.flushPending();
 check(f.ok && f.data.uploaded===1 && (await shotQueue.list(a)).length===0,'matching duplicate removed');
 const item={id:'same',userId:a,bucket:'media',path:pathFor(a,1),body:new Blob(['first'])};
 await shotQueue.add(item); let rejected=false; try {await shotQueue.add({...item,body:new Blob(['second'])})}catch{rejected=true}
 check(rejected && await (await shotQueue.list(a))[0].body.text()==='first','duplicate queue ID rejected without overwrite');
 port.dispose();
 await fetch('/result',{method:'POST',body:JSON.stringify({ok:true,checks})});
}
main().catch(async e=>{await fetch('/result',{method:'POST',body:JSON.stringify({ok:false,checks,error:String(e.stack||e)})})});
`;
let browser;
let done = false;
const server = http.createServer((req, res) => {
  if (req.url === "/disconnect") {
    req.socket.destroy();
    return;
  }
  if (req.url === "/result" && req.method === "POST") {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      res.end("ok");
      console.log(data);
      done = true;
      cleanup(JSON.parse(data).ok ? 0 : 1);
    });
    return;
  }
  if (req.url === "/test.js") {
    res.writeHead(200, { "Content-Type": "text/javascript" });
    res.end(script);
    return;
  }
  if (modules[req.url]) {
    res.writeHead(200, { "Content-Type": "text/javascript" });
    res.end(modules[req.url]);
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(
    '<!doctype html><title>Local storage test</title><script type="module" src="/test.js"></script>',
  );
});
function cleanup(code) {
  server.close();
  if (browser && browser.exitCode === null) {
    browser.once("exit", () => {
      try {
        fs.rmSync(profile, { recursive: true, force: true });
      } catch (e) {
        console.error("Profile retained:", profile, e.message);
      }
      process.exit(code);
    });
    browser.kill();
  } else {
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch (e) {
      console.error("Profile retained:", profile, e.message);
    }
    process.exit(code);
  }
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
  browser.on("error", (e) => {
    console.error(e.message);
    cleanup(1);
  });
  browser.on("exit", (code) => {
    if (!done) {
      console.error("Browser exited before result:", code);
      cleanup(1);
    }
  });
  setTimeout(() => {
    if (!done) {
      console.error("Timed out waiting for browser");
      cleanup(1);
    }
  }, 30000).unref();
});
