/* ============================================================
   lib-articles.mjs · 文章資料共用讀取（2026-10-19 立）
   ------------------------------------------------------------
   給 build-article-head、build-llms、build-static-lists、check-article-dates
   共用的小工具：列出所有文章資料夾、讀 article.json、判斷是否已上線。
   「已上線」判定與 build-sitemap.mjs、check-sitemap-coverage.mjs 同一套：
     articles/<id>/、ai-trends/<id>/ 同時有 index.html 與 article.json，
     不在 .vercelignore 整資料夾擋板內、index.html 沒有 noindex、沒有 article.unlisted。
   只讀不寫，不 import 任何會改檔的東西。
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SITE = "https://jiangyude.com";
export const SOURCE_ROOTS = ["articles", "ai-trends"];
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const readText = (p) => fs.readFileSync(p, "utf8");

/* .vercelignore 裡整資料夾擋著的文章（articles/<id>、ai-trends/<id>） */
export function loadBlocked() {
  const f = path.join(ROOT, ".vercelignore");
  if (!fs.existsSync(f)) return new Set();
  return new Set(
    readText(f).split("\n").map((l) => l.trim())
      .filter((l) => /^(articles|ai-trends)\/[^*/]+\/$/.test(l))
      .map((l) => l.replace(/\/$/, ""))
  );
}

export const isNoindex = (html) =>
  /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html);

/* 列出所有有 index.html＋article.json 的文章（含擋板與 noindex，由呼叫端決定要不要過濾） */
export function listArticles() {
  const blocked = loadBlocked();
  const out = [];
  for (const root of SOURCE_ROOTS) {
    const dir = path.join(ROOT, root);
    if (!fs.existsSync(dir)) continue;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const rel = `${root}/${ent.name}`;
      const htmlPath = path.join(ROOT, rel, "index.html");
      const jsonPath = path.join(ROOT, rel, "article.json");
      if (!fs.existsSync(htmlPath) || !fs.existsSync(jsonPath)) continue;
      let meta;
      try { meta = JSON.parse(readText(jsonPath)); } catch (e) {
        throw new Error(`${rel}/article.json 不是合法 JSON：${e.message}`);
      }
      const html = readText(htmlPath);
      out.push({
        rel, root, id: ent.name, htmlPath, jsonPath, meta,
        url: `${SITE}/${rel}/`,
        blocked: blocked.has(rel),
        unlisted: fs.existsSync(path.join(ROOT, rel, "article.unlisted")),
        noindex: isNoindex(html),
      });
    }
  }
  out.sort((a, b) => a.rel.localeCompare(b.rel));
  return out;
}

export const isLive = (a) => !a.blocked && !a.unlisted && !a.noindex;

/* 發佈日與最後更新日：updated 沒寫就等於 date */
export function articleDates(meta) {
  const date = String(meta.date || "").trim();
  const updated = String(meta.updated || meta.date || "").trim();
  return { date, updated };
}
