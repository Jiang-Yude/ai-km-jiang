#!/usr/bin/env node
/* ============================================================
   check-bilingual-nav.mjs · 主導覽一致性檢查（單語版，2026-10-19 改寫）
   ------------------------------------------------------------
   沿革：原本是中英雙語主導覽的逐字比對器（含 --write 自動覆寫）。2026-09-22 撤英文版後整關停用，
   之後沒有任何機制檢查全站手寫的 nav.top，盤查（2026-10-19）發現 216 頁裡有 2 頁是舊標籤
   （深度文章、技能包下載），兩頁都是 10 月的新文章。檔名保留不改，因為 preflight 第 5 關、
   文章模板與踩雷清單都用這個名字指它。

   檢查什麼（只比對、不改檔；09 踩雷清單第四、二十三節禁用自動覆寫，所以 --write 已移除）：
     全站公開 HTML 裡有 <nav class="top"> 且有 <ul class="nav-menu"> 的頁，
     選單裡的連結必須「恰好是」下面六項、順序相同、文字相同、連結解析後指向同一頁。
     不比對：空白、換行、縮排、active 標在哪一欄、a 標籤上的其他屬性。
     有 nav.top 但沒有 ul.nav-menu 的頁＝頁內專用導覽（簡報、互動頁），列出數量不擋。
   用法：
     node scripts/check-bilingual-nav.mjs                全站，有不一致就 exit 1
     node scripts/check-bilingual-nav.mjs --changed      preflight 用：只有「本次新增、或本次改動碰到導覽的 HTML」不一致才擋，
                                                         其餘舊頁的不一致只印提醒（比照 check-title-formula 的做法，
                                                         避免與本次無關的舊頁卡住每一次發布、逼人繞過規則）
     node scripts/check-bilingual-nav.mjs --only=a,b     只查指定檔（相對 repo 根目錄）
   被擋時：照印出的「應為」清單手動改那一塊 <ul class="nav-menu">。
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
if (argv.includes("--write")) {
  console.error("--write 已移除（09 踩雷清單第四、二十三節：自動覆寫導覽會連帶改掉頁面自訂內容）。照檢查結果手動改。");
  process.exit(2);
}
const onlyArg = argv.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? new Set(onlyArg.slice(7).split(",").filter(Boolean)) : null;
const CHANGED_MODE = argv.includes("--changed");
import { execSync } from "node:child_process";
// 「本次變更」＝新增的 HTML，或改動的新增行碰到導覽（nav-menu 或主導覽六頁的 <li><a>）。
// 只改 head 或內文的頁不算（2026-10-19：build-article-head 重寫 191 篇 head 時，若照檔名算，
// 舊頁積欠的導覽不一致會一次被拖進來擋下發布；比照 check-image-ratio 的收窄原則）。
const NAV_LINE = /nav-menu|<li[^>]*>\s*<a\b[^>]*href=["'][^"']*(?:index|knowledge-architecture|courses|articles|skills|offers)\.html/i;
function changedHtml() {
  const out = new Set();
  const run = (cmd) => { try { return execSync(cmd, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); } catch { return ""; } };
  for (const l of run("git ls-files --others --exclude-standard").split("\n")) if (l.endsWith(".html")) out.add(l.trim());
  for (const l of run("git diff --cached --name-only --diff-filter=A").split("\n")) if (l.endsWith(".html")) out.add(l.trim());
  for (const cmd of ["git -c core.quotepath=false diff HEAD -U0 -- '*.html'", "git -c core.quotepath=false diff --cached -U0 -- '*.html'"]) {
    let file = "";
    for (const line of run(cmd).split("\n")) {
      const h = line.match(/^diff --git a\/.+ b\/(.+)$/);
      if (h) { file = h[1]; continue; }
      if (file && line.startsWith("+") && !line.startsWith("+++") && NAV_LINE.test(line)) out.add(file);
    }
  }
  return out;
}
const CHANGED = CHANGED_MODE ? changedHtml() : null;

// 主導覽唯一定義（與首頁 index.html 一致；改主導覽時先改這裡再改各頁）
const MAIN_NAV = [
  { target: "index.html", label: "首頁" },
  { target: "knowledge-architecture.html", label: "知識架構" },
  { target: "courses.html", label: "課程" },
  { target: "articles.html", label: "文章" },
  { target: "skills.html", label: "小工具" },
  { target: "offers.html", label: "服務方案" },
];

const EXCLUDED = [".git/", "_trash/", "_templates/", "node_modules/", "scripts/", "tests/", "_analytics/", ".cloudflare-generated/", "en/"];
function blockedDirs() {
  const f = path.join(ROOT, ".vercelignore");
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, "utf8").split("\n").map((l) => l.trim()).filter((l) => /^[^#*!][^*]*\/$/.test(l));
}
const SKIP = [...EXCLUDED, ...blockedDirs()];

function walk(dir, prefix = "") {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (SKIP.some((p) => `${rel}/`.startsWith(p) || rel.startsWith(p))) continue;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else if (e.isFile() && rel.endsWith(".html") && !/^(index-parallel.*|_.*)\.html$/.test(e.name)) out.push(rel);
  }
  return out.sort();
}

function resolveHref(file, href) {
  const clean = href.split(/[?#]/)[0];
  let p;
  if (/^https?:\/\/jiangyude\.com\//.test(clean)) p = clean.replace(/^https?:\/\/jiangyude\.com\//, "");
  else if (/^[a-z]+:/i.test(clean)) return clean; // 外站
  else if (clean.startsWith("/")) p = clean.slice(1);
  else p = path.posix.normalize(path.posix.join(path.posix.dirname(file), clean));
  if (p === "" || p === "." || p.endsWith("/")) p = `${p === "." ? "" : p}index.html`;
  return p;
}
const text = (s) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

const files = walk(ROOT).filter((f) => !ONLY || ONLY.has(f));
if (ONLY && files.length !== ONLY.size) {
  console.error(`--only 指定的檔有找不到或被排除的：${[...ONLY].filter((f) => !files.includes(f)).join("、")}`);
  process.exit(2);
}
const errors = [];
let shared = 0, custom = 0;
for (const file of files) {
  const html = fs.readFileSync(path.join(ROOT, file), "utf8");
  if (!/<nav\b[^>]*class=["'][^"']*\btop\b/i.test(html)) continue;
  const m = html.match(/<ul\b[^>]*class=["'][^"']*\bnav-menu\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i);
  if (!m) { custom++; continue; }
  shared++;
  const links = [...m[1].matchAll(/<a\b[^>]*\bhref=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((x) => ({ href: x[1], to: resolveHref(file, x[1]), label: text(x[2]) }));
  const probs = [];
  if (links.length !== MAIN_NAV.length) probs.push(`有 ${links.length} 個連結，應為 ${MAIN_NAV.length} 個`);
  MAIN_NAV.forEach((want, i) => {
    const got = links[i];
    if (!got) return;
    if (got.label !== want.label) probs.push(`第 ${i + 1} 項文字「${got.label}」應為「${want.label}」`);
    if (got.to !== want.target) probs.push(`第 ${i + 1} 項連到 ${got.href}（解析為 ${got.to}），應指向 ${want.target}`);
  });
  if (probs.length) {
    const expect = MAIN_NAV.map((w) => `${w.label}→${path.posix.relative(path.posix.dirname(file), w.target) || w.target}`).join("、");
    errors.push(`${file}：${probs.join("；")}\n      應為：${expect}`);
  }
}

if (shared === 0) { console.error("找不到任何共用 nav.top 選單，本檢查不能靜默通過"); process.exit(1); }
if (CHANGED_MODE) {
  const block = errors.filter((e) => CHANGED.has(e.split("：")[0]));
  const old = errors.length - block.length;
  if (old) console.log(`  ⚠️ 有 ${old} 頁舊頁主導覽與定義不一致（本次沒動到，提醒不擋；全站清單跑 node scripts/check-bilingual-nav.mjs）`);
  if (block.length) {
    for (const e of block) console.error(`  ❌ ${e}`);
    console.error(`主導覽檢查失敗：本次變更的 ${block.length} 頁與主導覽定義不一致。照「應為」手動改，不要用自動覆寫。`);
    process.exit(1);
  }
  console.log(`主導覽 PASS（本次新增或動到導覽的 HTML ${CHANGED.size} 個）：${shared} 頁有共用選單，本次變更的頁全部一致。`);
  process.exit(0);
}
if (errors.length) {
  for (const e of errors) console.error(`  ❌ ${e}`);
  console.error(`主導覽檢查失敗：${errors.length} 頁與主導覽定義不一致（共 ${shared} 頁有共用選單）。照「應為」手動改，不要用自動覆寫。`);
  process.exit(1);
}
console.log(`主導覽 PASS：${shared} 頁共用 nav.top 選單與主導覽六項一致；${custom} 頁是頁內專用導覽，不納入比對。`);
