#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const writeMode = process.argv.includes("--write");
const onlyArg = process.argv.find((arg) => arg.startsWith("--only="));
const onlyFiles = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",").filter(Boolean)) : null;

const mainPages = [
  { key: "home", zh: "index.html", en: "en/index.html", zhLabel: "首頁", enLabel: "Home" },
  { key: "architecture", zh: "knowledge-architecture.html", en: "en/knowledge-architecture.html", zhLabel: "知識架構", enLabel: "Knowledge Architecture" },
  { key: "courses", zh: "courses.html", en: "en/courses.html", zhLabel: "課程", enLabel: "Courses" },
  { key: "articles", zh: "articles.html", en: "en/articles.html", zhLabel: "深度文章", enLabel: "Articles" },
  { key: "skills", zh: "skills.html", en: "en/skills.html", zhLabel: "技能包下載", enLabel: "Skill Packages" },
  { key: "services", zh: "offers.html", en: "en/offers.html", zhLabel: "服務方案", enLabel: "Services" }
];

const excludedPrefixes = [
  ".git/",
  "_trash/",
  "_templates/",
  "node_modules/",
  "scripts/",
  "articles/nontech-partner-ai-onboarding/"
];

function walk(dir, prefix = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.posix.join(prefix, entry.name);
    if (excludedPrefixes.some((p) => rel === p.slice(0, -1) || rel.startsWith(p))) continue;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel));
    else if (entry.isFile() && rel.endsWith(".html") && !/^index-parallel.*\.html$/.test(rel)) out.push(rel);
  }
  return out.sort();
}

function relLink(fromFile, targetFile) {
  return path.posix.relative(path.posix.dirname(fromFile), targetFile) || path.posix.basename(targetFile);
}

function sectionFor(file) {
  const f = file.startsWith("en/") ? file.slice(3) : file;
  if (f === "index.html") return "home";
  if (f === "knowledge-architecture.html") return "architecture";
  if (f === "courses.html" || f === "invited-talks.html" || f.startsWith("courses/")) return "courses";
  if (f === "articles.html" || f.startsWith("articles/") || f === "ai-trends.html" || f.startsWith("ai-trends/")) return "articles";
  if (f === "skills.html") return "skills";
  if (f === "offers.html" || f === "cases.html" || f.startsWith("offers/") || f.startsWith("cases/") || f.startsWith("ai-office/")) return "services";
  return null;
}

function languageTarget(file, isEnglish) {
  if (isEnglish) {
    const direct = file.slice(3);
    if (fs.existsSync(path.join(root, direct))) return direct;
    const section = sectionFor(file);
    return (mainPages.find((p) => p.key === section) || mainPages[0]).zh;
  }
  const direct = `en/${file}`;
  if (fs.existsSync(path.join(root, direct))) return direct;
  const section = sectionFor(file);
  return (mainPages.find((p) => p.key === section) || mainPages[0]).en;
}

function navMenu(file) {
  const isEnglish = file.startsWith("en/");
  const active = sectionFor(file);
  const links = mainPages.map((page) => {
    const target = isEnglish ? page.en : page.zh;
    const label = isEnglish ? page.enLabel : page.zhLabel;
    const activeAttr = page.key === active ? ' class="active"' : "";
    return `      <li><a href="${relLink(file, target)}"${activeAttr}>${label}</a></li>`;
  });
  const langTarget = languageTarget(file, isEnglish);
  links.push(`      <li class="lang-switch"><a href="${relLink(file, langTarget)}" hreflang="${isEnglish ? "zh-Hant" : "en"}">${isEnglish ? "中文" : "EN"}</a></li>`);
  return `<ul class="nav-menu">\n${links.join("\n")}\n    </ul>`;
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

const files = walk(root).filter((file) => !onlyFiles || onlyFiles.has(file));
const navFiles = [];
const changed = [];
const errors = [];
const customNavFiles = [];

for (const file of files) {
  const abs = path.join(root, file);
  let html = fs.readFileSync(abs, "utf8");
  if (!/<nav\b[^>]*class=["'][^"']*\btop\b/i.test(html)) continue;
  navFiles.push(file);
  const navMatch = html.match(/<ul\b[^>]*class=["'][^"']*\bnav-menu\b[^"']*["'][^>]*>[\s\S]*?<\/ul>/i);
  if (!navMatch) {
    customNavFiles.push(file);
    continue;
  }
  const expected = navMenu(file);
  if (navMatch[0] !== expected) {
    if (writeMode) {
      html = html.slice(0, navMatch.index) + expected + html.slice(navMatch.index + navMatch[0].length);
      fs.writeFileSync(abs, html);
      changed.push(file);
    } else {
      const actualLabels = [...navMatch[0].matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => stripTags(m[1]));
      errors.push(`${file}: 導航不一致（${actualLabels.join(" / ")}）`);
    }
  }
}

for (const page of mainPages) {
  for (const file of [page.zh, page.en]) {
    if (!fs.existsSync(path.join(root, file))) errors.push(`${file}: 主導航頁不存在`);
  }
}

if (writeMode) {
  console.log(`已同步 ${changed.length} 個共用 nav.top；掃描 ${navFiles.length} 個公開 HTML，略過 ${customNavFiles.length} 個頁內專用導航。`);
  if (errors.length) {
    for (const error of errors) console.error(`ERROR ${error}`);
    process.exit(1);
  }
  process.exit(0);
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR ${error}`);
  console.error(`雙語導航檢查失敗：${errors.length} 項。`);
  process.exit(1);
}

console.log(`雙語導航 PASS：${mainPages.length * 2} 個主導航頁存在，${navFiles.length - customNavFiles.length} 個共用 nav.top 結構一致；${customNavFiles.length} 個頁內專用導航不納入共用列。`);
