#!/usr/bin/env node
/* ============================================================
   generated-files.mjs · 讀 scripts/generated-files.json 的小工具（2026-10-19 立）
   ------------------------------------------------------------
   給 bash 腳本用，避免每支 shell 自己解析 JSON 或手抄清單。
   用法：
     node scripts/generated-files.mjs list                 印出全部生成檔路徑（一行一個）
     node scripts/generated-files.mjs list --kind=whole    只印整檔生成的
     node scripts/generated-files.mjs list --kind=section  只印部分段落生成的
     node scripts/generated-files.mjs builders             印出重建順序（一行一支腳本）
     node scripts/generated-files.mjs kind <path>          印出該檔的 kind；不是生成檔就印空字串、exit 1
   選項：--ref=<git ref> 改從該 ref 讀清單（merge-publish 合併前用分支版或 main 版）。
   讀不到清單一律 exit 2，不靜默回空清單（空清單＝所有生成檔都被當來源放行）。
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };

export function loadGenerated(ref = null, cwd = process.cwd()) {
  let text;
  if (ref) {
    text = execFileSync("git", ["show", `${ref}:scripts/generated-files.json`], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } else {
    const local = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url))), "generated-files.json");
    text = fs.readFileSync(local, "utf8");
  }
  const data = JSON.parse(text);
  if (!Array.isArray(data.files) || data.files.length === 0) throw new Error("generated-files.json 沒有 files");
  return data;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let data;
  try { data = loadGenerated(opt("ref")); } catch (e) {
    console.error(`generated-files：讀不到清單（${e.message}）`);
    process.exit(2);
  }
  const kind = opt("kind");
  if (cmd === "list") {
    for (const f of data.files) if (!kind || f.kind === kind) console.log(f.path);
  } else if (cmd === "builders") {
    for (const b of data.builders || []) console.log(b);
  } else if (cmd === "kind") {
    const hit = data.files.find((f) => f.path === args[1]);
    console.log(hit ? hit.kind : "");
    process.exit(hit ? 0 : 1);
  } else {
    console.error("用法：node scripts/generated-files.mjs list [--kind=whole|section] | builders | kind <path> [--ref=<ref>]");
    process.exit(2);
  }
}
