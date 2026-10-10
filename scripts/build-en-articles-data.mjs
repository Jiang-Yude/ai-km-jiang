#!/usr/bin/env node
// 英文版 2026-09-22 已撤除（江江決定：英文版沒心力維護，官網只留中文）。
// 本腳本保留為空殼，因為 merge-publish.sh 仍會呼叫 `node scripts/build-en-articles-data.mjs`、
// preflight.sh 過去會呼叫 `--check`。merge-publish.sh 執行途中 bash 邊跑邊讀，改它有風險，
// 所以先讓這支不做事並 exit 0，merge-publish 的呼叫與 REGENERATED 清單另開一輪清掉。
// 英文內容備存：git tag archive/en-final-2026-09-22；副知識庫「2026-09-22-1221 知識官網英文版備存」。
console.log("英文版 2026-09-22 已撤除，本腳本保留為空殼供 merge-publish 呼叫");
process.exit(0);
