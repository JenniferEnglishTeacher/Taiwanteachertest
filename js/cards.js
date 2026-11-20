/* 觀念卡（階段 1）：科目卡 → 章 → 逐張自評。
   卡片內容直接取自 data/book/ 的書稿；卡片清單由 data/cards.js 提供（_工作檔 build_cards.py 產生）。
   自評紀錄存在本機 localStorage「tep-cards-v1」：{ 卡號: { l: 0 已會 / 1–3 不會等級, s: 連續答對, n: 答錯次數, r: 自評次數, t: 時間 } } */
(() => {
"use strict";
const BOOKS = () => window.__TEP_BOOKS || [];
const IDX = () => window.__TEP_CARDS || {};
const NEW = [7, 1, 2, 3], OLD = [4, 5, 6];
const SK = "tep-cards-v1", PK = "tep-cards-pos", RK = "tep-cards-rate", AK = "tep-cards-auto";
const LV = [["已經會了", "ok"], ["不會 1", "l1"], ["不會 2", "l2"], ["不會 3", "l3"]];

const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 空間不足時忽略 */ } }
};
let ST = ls.get(SK, {});
const save = () => ls.set(SK, ST);

function h(tag, a, ...kids) {
  const e = document.createElement(tag);
  if (a) for (const [k, v] of Object.entries(a)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "html") e.innerHTML = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) { if (k == null || k === false) continue; e.append(k.nodeType ? k : String(k)); }
  return e;
}
const app = () => document.getElementById("app");
const cid = (b, c, x) => `${b}-${c}-${x.si}-${x.k}`;
const bookOf = (b) => BOOKS().find((x) => x.b === b);
const sysLabel = (b) => (b === 7 ? "共同科目" : b <= 3 ? "新制" : "舊制");

/* ---------- 書稿載入 ---------- */
const cache = {};
function loadChapter(b, c) {
  const k = `${b}-${c}`;
  if ((window.__TEP_BK || {})[k]) return Promise.resolve(window.__TEP_BK[k]);
  if (cache[k]) return cache[k];
  cache[k] = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = `data/book/b${b}c${String(c).padStart(2, "0")}.js`;
    s.onload = () => ((window.__TEP_BK || {})[k] ? res(window.__TEP_BK[k]) : rej(new Error("empty")));
    s.onerror = () => { delete cache[k]; rej(new Error("load")); };
    document.head.append(s);
  });
  return cache[k];
}
// 與 build_cards.py 同樣以 <h5> 切段：k = -1 整段；k = 0 含 h5 前的導言
function pick(html, k) {
  if (k < 0) return html;
  const parts = html.split(/<h5>[\s\S]*?<\/h5>/);
  return (k === 0 ? parts[0] : "") + (parts[k + 1] || "");
}

/* ---------- 統計 ---------- */
function chStats(b, c) {
  const list = IDX()[`${b}-${c}`] || [];
  let r = 0, bad = 0;
  list.forEach((x) => { const s = ST[cid(b, c, x)]; if (s) { r++; if (s.l > 0) bad++; } });
  return { n: list.length, r, bad };
}
function bookStats(b) {
  const bk = bookOf(b), t = { n: 0, r: 0, bad: 0 };
  if (bk) bk.ch.forEach((ch) => { const s = chStats(b, ch.c); t.n += s.n; t.r += s.r; t.bad += s.bad; });
  return t;
}
const pct = (r, n) => (n ? Math.round((r / n) * 100) : 0);
const bar = (r, n) => h("div", { class: "cd-bar", title: `${pct(r, n)}%` }, h("i", { style: `width:${pct(r, n)}%` }));

let qCount = null;
function questionsOf(b, c, si) {
  if (!qCount) {
    qCount = {};
    const api = window.__TEP_API;
    if (!api) return 0;
    api.mcq().forEach((q) => { if (q.cl !== "S") return; const g = api.guideOf(q); if (!g) return; const k = `${g[0]}-${g[1]}-${g[2]}`; qCount[k] = (qCount[k] || 0) + 1; });
  }
  return qCount[`${b}-${c}-${si}`] || 0;
}

/* ---------- 名詞連結 ---------- */
let terms = null;
function termList() {
  if (terms) return terms;
  terms = [];
  for (const key in IDX()) {
    const [b, c] = key.split("-").map(Number);
    IDX()[key].forEach((x) => { if (x.k >= 0 || x.p === "") terms.push({ t: x.t.replace(/^（[一二三四五六七八九十]+）/, ""), b, c, x, id: cid(b, c, x) }); });
  }
  return terms;
}
function findTerm(word, selfId, b) {
  let best = null, score = 0;
  for (const t of termList()) {
    if (t.id === selfId || t.t.length < 2) continue;
    let s = 0;
    if (t.t === word) s = 3; else if (t.t.startsWith(word)) s = 2; else if (word.length >= 3 && t.t.includes(word)) s = 1;
    if (!s) continue;
    if (t.b === b) s += 0.5;
    if (s > score) { score = s; best = t; }
  }
  return best;
}
function linkTerms(body, e) {
  body.querySelectorAll("b, strong").forEach((node) => {
    if (node.closest("th")) return;
    const word = node.textContent.split(/[（(：:，、]/)[0].trim();
    if (word.length < 2 || word.length > 14 || /^表\s*\d/.test(word)) return;
    const hit = findTerm(word, e.id, e.b);
    if (!hit) return;
    node.classList.add("cd-term");
    node.tabIndex = 0;
    node.setAttribute("role", "button");
    const open = (ev) => { ev.stopPropagation(); popTerm(hit); };
    node.addEventListener("click", open);
    node.addEventListener("keydown", (ev) => { if (ev.key === "Enter") open(ev); });
  });
}
function popTerm(t) {
  closePop();
  const prev = h("p", { class: "small muted" }, "載入中…");
  const pop = h("div", { class: "cd-pop", role: "dialog", "aria-label": t.t },
    h("p", { class: "small muted" }, `第${t.b}冊 第${t.c}章${t.x.p ? "・" + t.x.p : ""}`),
    h("h3", null, t.t), prev,
    h("div", { class: "cd-pop-act" },
      h("a", { class: "btn", href: `#/cards?b=${t.b}&c=${t.c}&i=${t.id}`, onclick: closePop }, "前往這張卡"),
      h("button", { class: "btn ghost", type: "button", onclick: closePop }, "關閉")));
  document.body.append(h("div", { class: "cd-mask", onclick: closePop }), pop);
  loadChapter(t.b, t.c).then((d) => {
    const div = h("div", { html: pick(d.secs[t.x.si].html, t.x.k) });
    const txt = div.textContent.replace(/\s+/g, " ").trim();
    prev.textContent = txt.length > 140 ? txt.slice(0, 140) + "…" : txt;
  }).catch(() => { prev.textContent = ""; });
}
function closePop() { document.querySelectorAll(".cd-pop, .cd-mask").forEach((n) => n.remove()); }

/* ---------- 朗讀 ---------- */
function stopTTS() { try { speechSynthesis.cancel(); } catch (e) { /* 不支援 */ } }
function speak(text, onend) {
  if (!("speechSynthesis" in window)) { alert("這個瀏覽器不支援朗讀。"); return; }
  stopTTS();
  const rate = ls.get(RK, 1);
  const voice = speechSynthesis.getVoices().find((v) => /zh[-_]TW/i.test(v.lang)) || speechSynthesis.getVoices().find((v) => /^zh/i.test(v.lang));
  const chunks = [];
  text.replace(/\s+/g, " ").split(/(?<=[。！？；\n])/).forEach((s) => {
    while (s.length > 180) { chunks.push(s.slice(0, 180)); s = s.slice(180); }
    if (s.trim()) chunks.push(s);
  });
  chunks.forEach((s, i) => {
    const u = new SpeechSynthesisUtterance(s);
    u.lang = "zh-TW"; u.rate = rate; if (voice) u.voice = voice;
    if (i === chunks.length - 1) u.onend = onend;
    speechSynthesis.speak(u);
  });
}
window.addEventListener("hashchange", () => { stopTTS(); closePop(); });

/* ---------- 頁面一：科目 ---------- */
function subjects(old) {
  app().append(navTabs("cards"),
    h("div", { class: "page-head" }, h("h1", null, "觀念卡"),
      h("p", { class: "lead" }, "選科目 → 選章 → 逐張翻卡自評。標成「不會」的卡，之後會依等級進入測驗。")),
    h("div", { class: "cd-tabs" },
      h("a", { href: "#/cards", class: old ? "" : "on" }, "新制與國語文"),
      h("a", { href: "#/cards?sys=old", class: old ? "on" : "" }, "舊制（94–109）")));
  const grid = h("div", { class: "cd-grid" });
  (old ? OLD : NEW).forEach((b) => {
    const bk = bookOf(b); if (!bk) return;
    const s = bookStats(b);
    grid.append(h("a", { class: "cd-subj", href: `#/cards?b=${b}` },
      h("span", { class: "cd-sys" }, sysLabel(b)),
      h("h2", null, bk.name),
      h("p", { class: "muted small" }, `${bk.ch.length} 章・${s.n} 張卡`),
      bar(s.r, s.n),
      h("p", { class: "small cd-stat" }, `完成 ${pct(s.r, s.n)}%`, h("span", { class: "muted" }, `（${s.r}／${s.n}）`),
        s.bad ? h("span", { class: "cd-badn" }, `不會 ${s.bad}`) : null)));
  });
  app().append(grid);
}

/* ---------- 頁面二：章 ---------- */
function chapters(b) {
  const bk = bookOf(b);
  if (!bk) { location.hash = "#/cards"; return; }
  const s = bookStats(b);
  app().append(
    h("div", { class: "page-head" },
      h("p", { class: "small" }, h("a", { href: b <= 3 || b === 7 ? "#/cards" : "#/cards?sys=old" }, "觀念卡"), ` ／ ${sysLabel(b)}`),
      h("h1", null, bk.name),
      h("p", { class: "lead" }, `${s.n} 張卡，已自評 ${s.r} 張（${pct(s.r, s.n)}%）。`)),
    h("div", { class: "row cd-actions" },
      s.bad ? h("a", { class: "btn", href: `#/cards?b=${b}&c=0&f=bad` }, `複習本科不會的卡（${s.bad}）`) : null,
      s.bad ? h("a", { class: "btn", href: `#/cards?v=quiz&b=${b}` }, `測驗本科不會的卡`) : null,
      s.r < s.n ? h("a", { class: "btn ghost", href: `#/cards?b=${b}&c=0&f=new` }, `本科未自評的卡（${s.n - s.r}）`) : null));
  const ul = h("ul", { class: "cd-chlist" });
  let part = "";
  bk.ch.forEach((ch) => {
    if (ch.p && ch.p !== part) { part = ch.p; ul.append(h("li", { class: "cd-part" }, part)); }
    const t = chStats(b, ch.c);
    ul.append(h("li", null,
      h("a", { class: "cd-ch", href: `#/cards?b=${b}&c=${ch.c}` },
        h("span", { class: "cd-chn" }, `第${ch.c}章`),
        h("span", { class: "cd-cht" }, ch.t),
        h("span", { class: "cd-chs" }, bar(t.r, t.n), h("span", { class: "small muted" }, `${t.r}／${t.n}`),
          t.bad ? h("span", { class: "cd-badn" }, `不會 ${t.bad}`) : null))));
  });
  app().append(ul);
}

/* ---------- 頁面三：翻卡 ---------- */
let viewerKeys = null;
document.addEventListener("keydown", (e) => {
  if (!viewerKeys || !location.hash.startsWith("#/cards") || e.metaKey || e.ctrlKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  viewerKeys(e);
});

function viewer(b, c, f, want) {
  const bk = bookOf(b);
  if (!bk) { location.hash = "#/cards"; return; }
  const chs = c ? [c] : bk.ch.map((x) => x.c);
  let list = chs.flatMap((cc) => (IDX()[`${b}-${cc}`] || []).map((x) => ({ b, c: cc, x, id: cid(b, cc, x) })));
  if (f === "bad") list = list.filter((e) => ST[e.id] && ST[e.id].l > 0);
  else if (f === "new") list = list.filter((e) => !ST[e.id]);
  const ch = c ? bk.ch.find((x) => x.c === c) : null;
  const base = `#/cards?b=${b}&c=${c}`;
  const posKey = `${b}-${c}-${f}`;

  app().append(h("div", { class: "page-head cd-vhead" },
    h("p", { class: "small" }, h("a", { href: "#/cards" }, "觀念卡"), " ／ ", h("a", { href: `#/cards?b=${b}` }, bk.name)),
    h("h1", null, c ? `第${c}章　${ch ? ch.t : ""}` : (f === "bad" ? "本科不會的卡" : "本科未自評的卡"))));
  app().append(h("div", { class: "cd-tabs sm" },
    [["all", "全部"], ["new", "未自評"], ["bad", "不會"]].map(([k, t]) => h("a", { href: `${base}&f=${k}`, class: f === k ? "on" : "" }, t))));

  if (!list.length) {
    app().append(h("div", { class: "qcard cd-empty" },
      h("p", null, f === "bad" ? "這裡沒有標成「不會」的卡。" : f === "new" ? "這裡的卡都自評過了。" : "這一章沒有卡片。"),
      h("p", null, h("a", { class: "btn ghost", href: `#/cards?b=${b}` }, "回章節列表"))));
    return;
  }

  const pos = ls.get(PK, {});
  let i = 0;
  if (want) { const w = list.findIndex((e) => e.id === want); if (w >= 0) i = w; }
  else if (pos[posKey] != null && pos[posKey] < list.length) i = pos[posKey];
  else { const u = list.findIndex((e) => !ST[e.id]); i = u >= 0 ? u : 0; }

  // 工具列
  let auto = ls.get(AK, false);
  const rateSel = h("select", { class: "cd-rate", "aria-label": "朗讀語速", onchange: (e) => ls.set(RK, Number(e.target.value)) },
    [0.8, 1, 1.2, 1.5].map((r) => h("option", { value: r, selected: ls.get(RK, 1) === r }, `${r}×`)));
  const ttsBtn = h("button", { class: "btn ghost sm", type: "button" }, "🔊 朗讀");
  const autoChk = h("input", { type: "checkbox", checked: auto, onchange: (e) => { auto = e.target.checked; ls.set(AK, auto); if (auto) reveal(); } });
  const counter = h("span", { class: "cd-count" });
  app().append(h("div", { class: "cd-tools" }, counter,
    h("span", { class: "cd-tool-r" }, ttsBtn, rateSel, h("label", { class: "small cd-auto" }, autoChk, "自動翻開"))));

  const card = h("article", { class: "qcard cd-card" });
  const rateBar = h("div", { class: "cd-ratebar" });
  const prevB = h("button", { class: "cd-nav", type: "button", "aria-label": "上一張", onclick: () => go(i - 1) }, "‹");
  const nextB = h("button", { class: "cd-nav", type: "button", "aria-label": "下一張", onclick: () => go(i + 1) }, "›");
  const btns = LV.map(([t, cls], l) => h("button", { class: `cd-lv ${cls}`, type: "button", onclick: () => rate(l) }, t));
  rateBar.append(prevB, ...btns, nextB);
  app().append(card, rateBar);

  let body = null, revealed = false, token = 0;
  function reveal() {
    if (!body || revealed) return;
    revealed = true;
    body.hidden = false;
    const rb = card.querySelector(".cd-reveal"); if (rb) rb.remove();
  }
  ttsBtn.onclick = () => {
    if (speechSynthesis.speaking) { stopTTS(); ttsBtn.textContent = "🔊 朗讀"; return; }
    reveal();
    const e = list[i];
    ttsBtn.textContent = "⏹ 停止";
    speak(`${e.x.t}。${body ? body.innerText : ""}`, () => { ttsBtn.textContent = "🔊 朗讀"; });
  };

  function render() {
    stopTTS(); ttsBtn.textContent = "🔊 朗讀";
    if (i >= list.length) return done();
    const e = list[i];
    pos[posKey] = i; ls.set(PK, pos);
    counter.textContent = `${i + 1} ／ ${list.length}`;
    prevB.disabled = i === 0;
    const cur = ST[e.id];
    btns.forEach((bt, l) => bt.classList.toggle("on", !!cur && cur.l === l));
    revealed = false;
    const my = ++token;
    const qn = questionsOf(e.b, e.c, e.x.si);
    const api = window.__TEP_API;
    body = h("div", { class: "bk-html cd-body", hidden: true }, h("p", { class: "muted small" }, "載入中…"));
    card.replaceChildren(...[
      h("div", { class: "cd-meta" },
        !c ? h("span", { class: "cd-chip" }, `第${e.c}章`) : null,
        e.x.p ? h("span", { class: "cd-parent" }, e.x.p) : null,
        cur ? h("span", { class: `cd-chip ${LV[cur.l][1]}` }, LV[cur.l][0]) : null),
      h("h2", { class: "cd-title" }, e.x.t),
      e.x.y ? h("p", { class: "cd-years small" }, `考過：${e.x.y}`) : null,
      qn ? h("p", { class: "small cd-q" }, `本小節考古題 ${qn} 題`,
        api ? h("button", { class: "link-btn", type: "button", onclick: () => practice(e) }, "　練習這些題目 →") : null) : null,
      h("button", { class: "btn ghost block cd-reveal", type: "button", onclick: reveal }, "翻開看內容（空白鍵）"),
      body].filter(Boolean));
    loadChapter(e.b, e.c).then((d) => {
      if (my !== token) return;
      const sec = d.secs[e.x.si];
      body.innerHTML = sec ? pick(sec.html, e.x.k) : "<p>找不到這段內容。</p>";
      linkTerms(body, e);
    }).catch(() => { if (my === token) body.innerHTML = "<p>書稿載入失敗（請確認 data/book 資料夾存在）。</p>"; });
    if (auto) reveal();
    card.scrollIntoView({ block: "nearest" });
  }
  function go(n) { if (n < 0 || n > list.length) return; i = n; render(); window.scrollTo(0, card.offsetTop - 80); }
  function rate(l) {
    const e = list[i]; if (!e) return;
    const old = ST[e.id] || {};
    ST[e.id] = { l, s: l === 0 ? (old.s || 0) : 0, n: old.n || 0, r: (old.r || 0) + 1, t: Date.now() };
    save();
    btns.forEach((bt, k) => bt.classList.toggle("on", k === l));
    setTimeout(() => go(i + 1), 180);
  }
  function practice(e) {
    const api = window.__TEP_API;
    const items = api.mcq().filter((q) => { const g = api.guideOf(q); return g && g[0] === e.b && g[1] === e.c && g[2] === e.x.si && q.cl === "S"; })
      .sort((x, y) => x.y - y.y || x.n - y.n);
    if (!items.length) { alert("這一節沒有中等學校類科的選擇題。"); return; }
    api.startQuiz({ mode: "practice", nav: "practice", title: `${e.x.p || e.x.t} 考古題`, items });
  }
  function done() {
    counter.textContent = `完成 ${list.length} 張`;
    delete pos[posKey]; ls.set(PK, pos);
    let ok = 0, bad = 0, none = 0;
    list.forEach((e) => { const s = ST[e.id]; if (!s) none++; else if (s.l === 0) ok++; else bad++; });
    const nextCh = c && c < bk.ch.length ? c + 1 : 0;
    card.replaceChildren(...[
      h("h2", { class: "cd-title" }, "這一輪完成了"),
      h("p", null, `已經會了 ${ok} 張・不會 ${bad} 張${none ? `・未自評 ${none} 張` : ""}`),
      h("div", { class: "row cd-actions" },
        bad ? h("a", { class: "btn", href: `${base}&f=bad` }, `只看不會的 ${bad} 張`) : null,
        bad ? h("a", { class: "btn", href: `#/cards?v=quiz&b=${b}${c ? `&c=${c}` : ""}` }, `測驗這${c ? "一章" : "一科"}不會的卡`) : null,
        h("button", { class: "btn ghost", type: "button", onclick: () => go(0) }, "從頭再看"),
        nextCh ? h("a", { class: "btn ghost", href: `#/cards?b=${b}&c=${nextCh}` }, `下一章 →`) : null,
        h("a", { class: "btn ghost", href: `#/cards?b=${b}` }, "回章節列表"))].filter(Boolean));
    btns.forEach((bt) => bt.classList.remove("on"));
  }

  // 左右滑動
  let sx = 0, sy = 0;
  card.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  card.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && !window.getSelection().toString()) go(dx < 0 ? i + 1 : i - 1);
  }, { passive: true });

  viewerKeys = (e) => {
    if (document.querySelector(".cd-pop")) { if (e.key === "Escape") closePop(); return; }
    if (e.key === "ArrowRight") { go(i + 1); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { go(i - 1); e.preventDefault(); }
    else if (e.key === " ") { reveal(); e.preventDefault(); }
    else if (/^[0-3]$/.test(e.key)) rate(Number(e.key));
  };
  render();
}

/* ====================== 階段 2：測驗、錯題本、紀錄 ====================== */
const WK = "tep-cards-wrong", HK = "tep-cards-hist", GK = "tep-cards-log";
const W8 = { 1: 1, 2: 2, 3: 4 };
const TYPES = { A: "考古題", B: "觀念選定義", C: "表格配對" };
const NEWSUB = [[7, "國語文"], [1, "教育理念"], [2, "學習者發展"], [3, "課程教學"]];
const L4 = "ABCD";
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const allEntries = (books) => {
  const out = [];
  for (const key in IDX()) {
    const [b, c] = key.split("-").map(Number);
    if (books && !books.includes(b)) continue;
    IDX()[key].forEach((x) => out.push({ b, c, x, id: cid(b, c, x) }));
  }
  return out;
};
const entryById = (id) => {
  const m = /^(\d+)-(\d+)-(\d+)-(-?\d+)$/.exec(id); if (!m) return null;
  const [b, c, si, k] = m.slice(1).map(Number);
  const x = (IDX()[`${b}-${c}`] || []).find((y) => y.si === si && y.k === k);
  return x ? { b, c, x, id } : null;
};
const fmtTime = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

/* ---------- 題目產生 ---------- */
function cardDom(d, e) { const sec = d.secs[e.x.si]; return h("div", { html: sec ? pick(sec.html, e.x.k) : "" }); }
const coreWords = (t) => t.replace(/^（[一二三四五六七八九十]+）/, "").replace(/[（(][^）)]*[）)]/g, "").split(/[、與及和：:，\s]/).map((w) => w.trim()).filter((w) => w.length >= 2);
function mask(text, words) { let s = text; words.forEach((w) => { s = s.split(w).join("□□"); }); return s; }
function snippet(d, e) {
  const dom = cardDom(d, e);
  dom.querySelectorAll(".tbl, table, blockquote, h5").forEach((n) => n.remove());
  let txt = [...dom.querySelectorAll("p, li")].map((n) => n.textContent.trim()).filter((t) => t && !/^表\s*\d/.test(t)).join(" ").replace(/\s+/g, " ");
  if (txt.length < 24) return "";
  if (txt.length > 90) { const cut = txt.slice(0, 90); const m = cut.lastIndexOf("。"); txt = (m > 40 ? cut.slice(0, m + 1) : cut + "…"); }
  return mask(txt, coreWords(e.x.t));
}
function tables(d, e) {
  const dom = cardDom(d, e), out = [];
  dom.querySelectorAll("table").forEach((tb) => {
    const head = [...tb.querySelectorAll("thead th, thead td")].map((n) => n.textContent.trim());
    const rows = [...tb.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((n) => n.textContent.trim().replace(/\s+/g, " ")));
    if (head.length < 2 || rows.length < 3) return;
    let cap = "", p = tb.closest(".tbl") || tb;
    p = p.previousElementSibling;
    if (p && /^表\s*\d/.test(p.textContent.trim())) cap = p.textContent.trim().replace(/^表\s*[\d\-－]+\s*/, "");
    const keys = rows.map((r) => r[0]);
    if (new Set(keys).size !== keys.length || keys.some((k) => !k || k.length > 30)) return;
    out.push({ cap, head, rows });
  });
  return out;
}
function genC(d, e) {
  const tbs = tables(d, e); if (!tbs.length) return null;
  const tb = tbs[Math.floor(Math.random() * tbs.length)];
  const cols = tb.head.map((_, j) => j).filter((j) => j > 0 && tb.rows.every((r) => r[j] && r[j].length >= 2 && r[j].length <= 90) && new Set(tb.rows.map((r) => r[j])).size === tb.rows.length);
  if (!cols.length) return null;
  const j = cols[Math.floor(Math.random() * cols.length)];
  const ri = Math.floor(Math.random() * tb.rows.length), row = tb.rows[ri];
  const others = shuffle(tb.rows.filter((_, k) => k !== ri)).slice(0, 3).map((r) => r[0]);
  const opts = shuffle([row[0], ...others]);
  const cell = mask(row[j], tb.rows.map((r) => r[0]).filter((k) => k.length >= 2));
  return { type: "C", card: e.id, stem: `${tb.cap ? `依「${tb.cap}」，` : ""}${tb.head[j]}為「${cell}」的${tb.head[0]}是：`, opts, ans: opts.indexOf(row[0]) };
}
const isSummary = (e) => /^[一二三四五六七八九十]+、/.test(e.x.t);
function genB(d, e, pool) {
  if (isSummary(e)) return null;
  const sn = snippet(d, e); if (!sn) return null;
  const cands = shuffle(pool.filter((p) => p.e.id !== e.id && p.sn && p.sn !== sn && !isSummary(p.e))).slice(0, 3);
  if (cands.length < 3) return null;
  const opts = shuffle([sn, ...cands.map((c) => mask(c.sn, coreWords(e.x.t)))]);
  return { type: "B", card: e.id, stem: `下列哪一段敘述說的是「${e.x.t.replace(/^（[一二三四五六七八九十]+）/, "")}」${e.x.p ? `（${e.x.p.replace(/^（[一二三四五六七八九十]+）/, "")}）` : ""}？`, opts, ans: opts.indexOf(sn) };
}
function linkedQs(e) {
  const api = window.__TEP_API; if (!api) return [];
  return api.mcq().filter((q) => { if (q.cl !== "S") return false; const g = api.guideOf(q); return g && g[0] === e.b && g[1] === e.c && g[2] === e.x.si; });
}
function genA(e) {
  const qs = linkedQs(e); if (!qs.length) return null;
  const q = qs[Math.floor(Math.random() * qs.length)];
  return { type: "A", card: e.id, qid: q.id };
}

function weightedPick(pool, n) {
  const out = []; let bag = pool.slice();
  while (out.length < n && pool.length) {
    if (!bag.length) bag = pool.slice();
    let sum = 0; bag.forEach((e) => { sum += W8[(ST[e.id] || {}).l] || 1; });
    let r = Math.random() * sum, k = 0;
    for (; k < bag.length - 1; k++) { r -= W8[(ST[bag[k].id] || {}).l] || 1; if (r <= 0) break; }
    out.push(bag[k]); bag.splice(k, 1);
  }
  return out;
}
async function buildQuiz(picked, types) {
  const chs = new Set();
  picked.forEach((e) => { chs.add(`${e.b}-${e.c}`); const n = (IDX()[`${e.b}-${e.c}`] || []).length; if (n < 8) { if (e.c > 1) chs.add(`${e.b}-${e.c - 1}`); chs.add(`${e.b}-${e.c + 1}`); } });
  const data = {};
  await Promise.all([...chs].map((k) => { const [b, c] = k.split("-").map(Number); return loadChapter(b, c).then((d) => { data[k] = d; }).catch(() => {}); }));
  const snip = {};
  const poolOf = (b, c) => {
    const out = [];
    [c, c - 1, c + 1].forEach((cc) => { const d = data[`${b}-${cc}`]; if (!d) return; (IDX()[`${b}-${cc}`] || []).forEach((x) => { const e = { b, c: cc, x, id: cid(b, cc, x) }; if (!(e.id in snip)) snip[e.id] = snippet(d, e); out.push({ e, sn: snip[e.id] }); }); });
    return out;
  };
  const qs = [];
  for (const e of picked) {
    const d = data[`${e.b}-${e.c}`]; if (!d) continue;
    const order = shuffle(types.slice());
    let q = null;
    for (const t of order) { q = t === "A" ? genA(e) : t === "B" ? genB(d, e, poolOf(e.b, e.c)) : genC(d, e); if (q) break; }
    if (!q) q = genB(d, e, poolOf(e.b, e.c)) || genA(e) || genC(d, e);
    if (q) qs.push(q);
  }
  return qs;
}

/* ---------- 紀錄與錯題本 ---------- */
function bumpCard(id, ok) {
  const s = ST[id] || { l: 1, s: 0, n: 0, r: 0, t: Date.now() };
  if (ok) s.s = (s.s || 0) + 1;
  else { s.l = Math.min(3, Math.max(1, (s.l || 0) + 1)); s.n = (s.n || 0) + 1; s.s = 0; }
  s.t = Date.now(); ST[id] = s; save();
}
const wrongKey = (q) => q.type === "A" ? `A:${q.qid}` : `${q.type}:${q.card}:${q.stem}`;
function saveWrong(q) {
  const W = ls.get(WK, {}); const k = wrongKey(q);
  W[k] = { q, n: ((W[k] || {}).n || 0) + 1, t: Date.now() }; ls.set(WK, W);
}
function dropWrong(q) { const W = ls.get(WK, {}); delete W[wrongKey(q)]; ls.set(WK, W); const T = ls.get("tep-cards-wtomb", {}); T[wrongKey(q)] = Date.now(); ls.set("tep-cards-wtomb", T); }

/* ---------- 開測驗 ---------- */
function quizSetup(qs) {
  const b = Number(qs.get("b")) || 0, c = Number(qs.get("c")) || 0, lv = Number(qs.get("lv")) || 0;
  const books = b ? [b] : NEW.concat(OLD);
  let pool = allEntries(books).filter((e) => (!c || e.c === c) && ST[e.id] && ST[e.id].l > 0 && (!lv || ST[e.id].l === lv));
  const bk = b ? bookOf(b) : null;
  const scope = (b ? bk.name : "全部科目") + (c ? ` 第${c}章` : "") + (lv ? `・不會 ${lv}` : "");
  app().append(navTabs("quiz"), h("div", { class: "page-head" }, h("h1", null, "測驗"), h("p", { class: "lead" }, `範圍：${scope}。只抽「不會」的卡，抽中機率 不會1 : 不會2 : 不會3 ＝ 1 : 2 : 4。`)));
  if (!pool.length) {
    app().append(h("div", { class: "qcard cd-empty" }, h("p", null, "這個範圍還沒有標成「不會」的卡。先去翻卡自評。"), h("p", null, h("a", { class: "btn", href: b ? `#/cards?b=${b}` : "#/cards" }, "去翻卡"))));
    if (!b) app().append(scopePicker());
    return;
  }
  const cnt = [1, 2, 3].map((l) => pool.filter((e) => ST[e.id].l === l).length);
  let n = 20; const types = new Set(["A", "B", "C"]);
  const nSel = h("div", { class: "cd-tabs sm" });
  const drawN = () => nSel.replaceChildren(...[10, 20, 30, 50].map((k) => h("a", { href: "javascript:void 0", class: n === k ? "on" : "", onclick: () => { n = k; drawN(); } }, `${k} 題`)));
  drawN();
  const tSel = h("div", { class: "cd-types" }, Object.entries(TYPES).map(([k, t]) => h("label", null, h("input", { type: "checkbox", checked: true, onchange: (ev) => { ev.target.checked ? types.add(k) : types.delete(k); } }), t)));
  const go = h("button", { class: "btn lg", type: "button" }, "開始測驗");
  go.onclick = async () => {
    if (!types.size) { alert("至少選一種題型。"); return; }
    go.disabled = true; go.textContent = "出題中…";
    const items = await buildQuiz(weightedPick(pool, n), [...types]);
    if (!items.length) { go.disabled = false; go.textContent = "開始測驗"; alert("這些卡出不了題目，請換範圍或題型。"); return; }
    runQuiz(items, scope);
  };
  app().append(h("article", { class: "qcard" },
    h("p", null, `可抽的卡：${pool.length} 張（不會1：${cnt[0]}、不會2：${cnt[1]}、不會3：${cnt[2]}）`),
    h("h3", null, "題數"), nSel, h("h3", null, "題型"), tSel,
    h("p", { class: "small muted" }, "考古題：從這張卡對應小節的歷屆選擇題抽。觀念選定義：從四段書中敘述選出說的是哪個觀念。表格配對：從卡片裡的表格出配對題。卡片出不了某種題型時會自動換一種。"),
    go));
  if (!b) app().append(scopePicker());
}
function scopePicker() {
  const box = h("article", { class: "qcard sm" }, h("h3", null, "換範圍"));
  const row = h("div", { class: "row cd-actions" });
  NEW.concat(OLD).forEach((b) => { const s = bookStats(b); if (s.bad) row.append(h("a", { class: "btn ghost sm", href: `#/cards?v=quiz&b=${b}` }, `${bookOf(b).name}（${s.bad}）`)); });
  [1, 2, 3].forEach((l) => row.append(h("a", { class: "btn ghost sm", href: `#/cards?v=quiz&lv=${l}` }, `只考不會 ${l}`)));
  box.append(row); return box;
}

/* ---------- 作答 ---------- */
function runQuiz(items, scope, fromBook) {
  app().replaceChildren();
  window.scrollTo(0, 0);
  const api = window.__TEP_API;
  const res = [];
  let i = 0;
  const head = h("div", { class: "cd-qhead" });
  const box = h("div");
  app().append(head, box);
  const show = () => {
    if (i >= items.length) return finish();
    const q = items[i];
    head.replaceChildren(h("span", { class: "cd-count" }, `${i + 1} ／ ${items.length}`), h("span", { class: "cd-chip" }, TYPES[q.type]),
      h("span", { class: "small muted cd-qscope" }, scope),
      h("button", { class: "link-btn", type: "button", onclick: () => { if (confirm("結束這次測驗？已作答的題目會記錄。")) finish(); } }, "提前結束"));
    box.replaceChildren();
    const e = entryById(q.card);
    const after = (ok, el) => {
      res.push({ q, ok });
      bumpCard(q.card, ok);
      if (fromBook) { if (ok) dropWrong(q); else saveWrong(q); } else if (!ok) saveWrong(q);
      const log = ls.get(GK, []); log.push({ b: e ? e.b : 0, ok, t: Date.now() }); ls.set(GK, log.slice(-3000));
      const nx = h("button", { class: "btn lg block", type: "button", onclick: () => { i++; show(); } }, i + 1 < items.length ? "下一題（Enter）" : "看結果");
      el.append(h("div", { class: "cd-after" },
        e ? h("button", { class: "btn ghost", type: "button", onclick: () => popCard(e) }, `看觀念卡：${e.x.t}`) : null, nx));
      nx.focus({ preventScroll: true });
      quizKeys = (ev) => { if (ev.key === "Enter") { ev.preventDefault(); nx.click(); } };
    };
    if (q.type === "A") {
      const Q = api && api.mcq().find((x) => x.id === q.qid);
      if (!Q) { i++; return show(); }
      const draw = (picked) => {
        const card = api.mcqCard(Q, picked == null ? { onPick: (L) => { quizKeys = null; const ok = api.isCorrect(Q, L); api.record(Q.id, ok); draw(L); after(ok, wrap); } } : { picked, locked: true });
        wrap.replaceChildren(card);
      };
      const wrap = h("div");
      box.append(wrap); draw(null);
      quizKeys = (ev) => { const k = ev.key.toUpperCase(); const ix = "ABCDE".indexOf(k) >= 0 ? "ABCDE".indexOf(k) : "1234".indexOf(k); if (ix >= 0 && ix < Q.o.length) { const b = wrap.querySelectorAll(".opt")[ix]; if (b) b.click(); } };
    } else {
      const card = h("article", { class: "qcard" }, h("p", { class: "stem" }, q.stem));
      const opts = h("div", { class: "opts" });
      const btns = q.opts.map((t, k) => h("button", { class: "opt", type: "button", onclick: () => choose(k) }, h("span", { class: "letter" }, L4[k]), h("span", { class: "otext" }, t)));
      opts.append(...btns); card.append(opts); box.append(card);
      const choose = (k) => {
        quizKeys = null;
        const ok = k === q.ans;
        btns.forEach((b, j) => { b.disabled = true; if (j === q.ans) { b.classList.add("correct"); } else if (j === k) b.classList.add("wrong"); });
        card.append(h("div", { class: `feedback ${ok ? "ok" : "bad"}` }, h("div", { class: "fbody" }, h("strong", null, ok ? "答對了" : "答錯了"), `　正確答案：${L4[q.ans]}`)));
        after(ok, card);
      };
      quizKeys = (ev) => { const k = ev.key.toUpperCase(); const ix = L4.indexOf(k) >= 0 ? L4.indexOf(k) : "1234".indexOf(k); if (ix >= 0 && ix < q.opts.length) choose(ix); };
    }
    window.scrollTo(0, 0);
  };
  const finish = () => {
    quizKeys = null;
    const ok = res.filter((r) => r.ok).length, wrong = res.filter((r) => !r.ok);
    const per = {}; res.forEach((r) => { const e = entryById(r.q.card); const b = e ? e.b : 0; (per[b] ||= [0, 0]); per[b][1]++; if (r.ok) per[b][0]++; });
    if (res.length) {
      const H = ls.get(HK, []);
      H.push({ t: Date.now(), scope: fromBook ? "錯題本重做" : scope, n: res.length, ok, per, wrong: wrong.map((r) => ({ q: r.q, title: (entryById(r.q.card) || { x: { t: "" } }).x.t })) });
      ls.set(HK, H.slice(-300));
    }
    if (api && api.refreshBadge) api.refreshBadge();
    app().replaceChildren(navTabs("quiz"));
    const sc = res.length ? Math.round((ok / res.length) * 100) : 0;
    const card = h("article", { class: "qcard" }, h("h1", { class: "cd-title" }, "測驗結束"),
      h("p", { class: "cd-score" }, h("b", null, `${sc}`), ` 分（${ok}／${res.length}）`),
      h("p", { class: "small muted" }, "答錯的卡自動升一級（最高不會3），並存進錯題本。"));
    const row = h("div", { class: "row cd-actions" });
    if (wrong.length) row.append(h("button", { class: "btn", type: "button", onclick: () => runQuiz(wrong.map((r) => r.q), "只重做錯題", fromBook) }, `只重做錯題（${wrong.length}）`));
    row.append(h("a", { class: "btn ghost", href: "#/cards?v=quiz" }, "再考一次"), h("a", { class: "btn ghost", href: "#/cards?v=hist" }, "看紀錄"));
    card.append(row);
    if (wrong.length) {
      const ul = h("ul", { class: "cd-wlist" });
      wrong.forEach((r) => { const e = entryById(r.q.card); ul.append(h("li", null, h("span", { class: "cd-chip" }, TYPES[r.q.type]), " ", e ? h("button", { class: "link-btn", type: "button", onclick: () => popCard(e) }, e.x.t) : "", h("div", { class: "small muted" }, r.q.type === "A" ? `考古題 ${r.q.qid}` : r.q.stem))); });
      card.append(h("h3", null, "錯題"), ul);
    }
    app().append(card);
    window.scrollTo(0, 0);
  };
  show();
}
let quizKeys = null;
document.addEventListener("keydown", (e) => {
  if (!quizKeys || !location.hash.startsWith("#/cards") || e.metaKey || e.ctrlKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  quizKeys(e);
});

function popCard(e) {
  closePop();
  const body = h("div", { class: "bk-html cd-popbody" }, h("p", { class: "muted small" }, "載入中…"));
  const pop = h("div", { class: "cd-pop big", role: "dialog", "aria-label": e.x.t },
    h("p", { class: "small muted" }, `${bookOf(e.b).name} 第${e.c}章${e.x.p ? "・" + e.x.p : ""}`), h("h3", null, e.x.t), body,
    h("div", { class: "cd-pop-act" }, h("button", { class: "btn ghost", type: "button", onclick: closePop }, "關閉")));
  document.body.append(h("div", { class: "cd-mask", onclick: closePop }), pop);
  loadChapter(e.b, e.c).then((d) => { body.innerHTML = pick(d.secs[e.x.si].html, e.x.k); }).catch(() => { body.textContent = "載入失敗"; });
}

/* ---------- 錯題本 ---------- */
function wrongView() {
  const W = ls.get(WK, {});
  const list = Object.values(W).sort((a, b) => b.t - a.t);
  app().append(navTabs("wrong"), h("div", { class: "page-head" }, h("h1", null, "觀念卡錯題本"),
    h("p", { class: "lead" }, `${list.length} 題。在這裡重做答對就移出錯題本。考古題答錯也會同時記進網站原本的「錯題本」。`)));
  if (!list.length) { app().append(h("div", { class: "qcard cd-empty" }, h("p", null, "目前沒有錯題。"))); return; }
  const row = h("div", { class: "row cd-actions" }, h("button", { class: "btn", type: "button", onclick: () => runQuiz(shuffle(list.map((w) => w.q)), "錯題本", true) }, `全部重做（${list.length}）`));
  const by = {}; list.forEach((w) => { const e = entryById(w.q.card); const b = e ? e.b : 0; (by[b] ||= []).push(w); });
  Object.keys(by).forEach((b) => { if (Number(b) && by[b].length) row.append(h("button", { class: "btn ghost sm", type: "button", onclick: () => runQuiz(shuffle(by[b].map((w) => w.q)), `錯題本・${bookOf(Number(b)).name}`, true) }, `${bookOf(Number(b)).name}（${by[b].length}）`)); });
  app().append(row);
  const ul = h("ul", { class: "cd-wlist qcard" });
  list.forEach((w) => {
    const e = entryById(w.q.card);
    ul.append(h("li", null,
      h("div", null, h("span", { class: "cd-chip" }, TYPES[w.q.type]), " ", e ? h("button", { class: "link-btn", type: "button", onclick: () => popCard(e) }, e.x.t) : "",
        h("span", { class: "small muted" }, `　錯 ${w.n} 次・${fmtTime(w.t)}`)),
      h("div", { class: "small muted" }, w.q.type === "A" ? `考古題 ${w.q.qid}` : w.q.stem),
      h("button", { class: "link-btn small", type: "button", onclick: (ev) => { dropWrong(w.q); ev.target.closest("li").remove(); } }, "移出")));
  });
  app().append(ul);
}

/* ---------- 紀錄與及格圖 ---------- */
function subjectScores() {
  const log = ls.get(GK, []), out = {};
  NEW.concat(OLD).forEach((b) => {
    const xs = log.filter((r) => r.b === b).slice(-60);
    out[b] = xs.length >= 10 ? { s: Math.round((xs.filter((r) => r.ok).length / xs.length) * 100), n: xs.length } : { s: null, n: xs.length };
  });
  return out;
}
function passChart() {
  const sc = subjectScores();
  const W = 380, rowH = 42, top = 26, left = 128, plotW = W - left - 34;
  const x = (v) => left + (v / 100) * plotW;
  const svg = [`<svg viewBox="0 0 ${W} ${top + NEWSUB.length * rowH + 10}" class="cd-chart" role="img" aria-label="新制四科估計分數">`];
  [0, 50, 60, 100].forEach((v) => svg.push(`<line x1="${x(v)}" x2="${x(v)}" y1="${top - 8}" y2="${top + NEWSUB.length * rowH - 8}" class="${v === 60 ? "g60" : v === 50 ? "g50" : "g0"}"/><text x="${x(v)}" y="${top - 12}" text-anchor="middle" class="ax">${v}</text>`));
  NEWSUB.forEach(([b, name], k) => {
    const y = top + k * rowH, s = sc[b];
    svg.push(`<text x="${left - 10}" y="${y + 17}" text-anchor="end" class="lb">${name}</text>`);
    if (s.s == null) svg.push(`<text x="${left + 6}" y="${y + 17}" class="na">資料不足（${s.n}／10 題）</text>`);
    else svg.push(`<rect x="${left}" y="${y + 2}" width="${Math.max(2, x(s.s) - left)}" height="22" rx="6" class="${s.s >= 60 ? "ok" : s.s >= 50 ? "mid" : "bad"}"/><text x="${x(s.s) + 6}" y="${y + 18}" class="vl">${s.s}</text>`);
  });
  svg.push("</svg>");
  const vals = NEWSUB.map(([b]) => sc[b].s);
  let verdict, cls;
  if (vals.some((v) => v == null)) { verdict = "還不能判斷：每科至少要有 10 題測驗紀錄。"; cls = ""; }
  else {
    const avg = Math.round(vals.reduce((a, v) => a + v, 0) / 4), low = vals.filter((v) => v < 50).length, zero = vals.some((v) => v === 0);
    const why = [];
    if (avg < 60) why.push(`平均 ${avg} 分，未滿 60`);
    if (low >= 2) why.push(`${low} 科未滿 50`);
    if (zero) why.push("有一科 0 分");
    verdict = why.length ? `估計未通過：${why.join("；")}。` : `估計通過：平均 ${avg} 分，沒有兩科未滿 50、沒有 0 分。`;
    cls = why.length ? "bad" : "ok";
  }
  const old = OLD.map((b) => `${bookOf(b).name} ${sc[b].s == null ? "—" : sc[b].s}`).join("　");
  return h("article", { class: "qcard" }, h("h2", { class: "cd-h2" }, "及格標準對照（新制四科）"),
    h("div", { html: svg.join("") }),
    h("p", { class: `cd-verdict ${cls}` }, verdict),
    h("p", { class: "small muted" }, "通過標準（教師資格考試辦法第 9 條）：應試科目總成績平均滿 60 分；不得有 2 科均未滿 50 分；不得有 1 科為 0 分。"),
    h("p", { class: "small muted" }, "分數＝每科最近 60 題觀念卡測驗的答對率。測驗只抽「不會」的卡，所以會比實際偏低。"),
    h("p", { class: "small muted" }, `舊制參考：${old}`));
}
function histView() {
  const H = ls.get(HK, []).slice().reverse();
  app().append(navTabs("hist"), h("div", { class: "page-head" }, h("h1", null, "測驗紀錄")), passChart());
  if (!H.length) { app().append(h("div", { class: "qcard cd-empty" }, h("p", null, "還沒有測驗紀錄。"))); return; }
  const ul = h("div", { class: "cd-hist" });
  H.forEach((r) => {
    const sc = Math.round((r.ok / r.n) * 100);
    const d = h("details", { class: "qcard sm" }, h("summary", null, h("b", null, fmtTime(r.t)), `　${r.scope}　`, h("span", { class: `cd-chip ${sc >= 60 ? "ok" : "l1"}` }, `${sc} 分`), h("span", { class: "small muted" }, `　${r.ok}／${r.n}`)));
    if (r.wrong.length) {
      const ul2 = h("ul", { class: "cd-wlist" });
      r.wrong.forEach((w) => { const e = entryById(w.q.card); ul2.append(h("li", null, h("span", { class: "cd-chip" }, TYPES[w.q.type]), " ", e ? h("button", { class: "link-btn", type: "button", onclick: () => popCard(e) }, w.title) : w.title)); });
      d.append(h("p", { class: "small" }, `錯的觀念 ${r.wrong.length} 個：`), ul2,
        h("button", { class: "btn ghost sm", type: "button", onclick: () => runQuiz(r.wrong.map((w) => w.q), `重做 ${fmtTime(r.t)} 的錯題`) }, "重做這次的錯題"));
    } else d.append(h("p", { class: "small" }, "全對。"));
    ul.append(d);
  });
  app().append(ul);
}

/* ---------- 開場對話框 ---------- */
function startDialog() {
  try { if (sessionStorage.getItem("tep-cards-asked")) return; sessionStorage.setItem("tep-cards-asked", "1"); } catch (e) { return; }
  const H = ls.get(HK, []);
  const last = H.length ? H[H.length - 1] : null;
  const anyBad = Object.values(ST).some((s) => s.l > 0);
  let next = null;
  for (const b of NEW.concat(OLD)) { const bk = bookOf(b); if (!bk) continue; const ch = bk.ch.find((c) => { const s = chStats(b, c.c); return s.r < s.n; }); if (ch) { next = { b, c: ch.c, t: ch.t, name: bk.name }; break; } }
  if (!(last && last.wrong.length) && !anyBad) return;
  const lvRow = h("div", { class: "row cd-actions" }, [1, 2, 3].map((l) => { const n = Object.values(ST).filter((s) => s.l === l).length; return n ? h("a", { class: "btn ghost sm", href: `#/cards?v=quiz&lv=${l}`, onclick: closePop }, `不會 ${l}（${n}）`) : null; }));
  const pop = h("div", { class: "cd-pop", role: "dialog", "aria-label": "今天要做什麼" }, h("h3", null, "今天要做什麼？"),
    last && last.wrong.length ? h("button", { class: "btn block", type: "button", onclick: () => { closePop(); runQuiz(last.wrong.map((w) => w.q), "上次的錯題"); } }, `複習上次錯題（${last.wrong.length}）`) : null,
    anyBad ? h("p", { class: "small", style: "margin:12px 0 4px" }, "複習某個等級：") : null, anyBad ? lvRow : null,
    next ? h("a", { class: "btn ghost block", href: `#/cards?b=${next.b}&c=${next.c}`, onclick: closePop }, `繼續新單元：${next.name} 第${next.c}章`) : null,
    h("div", { class: "cd-pop-act" }, h("button", { class: "link-btn", type: "button", onclick: closePop }, "先不用")));
  document.body.append(h("div", { class: "cd-mask", onclick: closePop }), pop);
}

function navTabs(on) {
  return h("div", { class: "cd-tabs cd-main" },
    [["cards", "觀念卡", "#/cards"], ["quiz", "測驗", "#/cards?v=quiz"], ["wrong", "錯題本", "#/cards?v=wrong"], ["hist", "紀錄", "#/cards?v=hist"], ["sync", "備份", "#/cards?v=sync"]]
      .map(([k, t, href]) => h("a", { href, class: on === k ? "on" : "" }, t, k === "wrong" && Object.keys(ls.get(WK, {})).length ? h("b", { class: "cd-nbadge" }, Object.keys(ls.get(WK, {})).length) : null)));
}

/* ====================== 階段 3：跨裝置備份 ====================== */
const YK = "tep-sync", TK = "tep-cards-wtomb", DK = "tep-sync-dirty";
const GAS_CODE = `// 教檢練習：跨裝置備份（貼到 script.google.com 新專案，部署成「網頁應用程式」）
// 資料存成你 Google 雲端硬碟裡的 tep-<同步碼>.json
function file_(code) {
  code = String(code || "").replace(/[^A-Za-z0-9]/g, "");
  if (code.length < 8) throw new Error("同步碼太短");
  const it = DriveApp.getFilesByName("tep-" + code + ".json");
  return { code: code, f: it.hasNext() ? it.next() : null };
}
function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function doGet(e) {
  try {
    const r = file_(e.parameter.code);
    return out_({ ok: true, data: r.f ? JSON.parse(r.f.getBlob().getDataAsString()) : null });
  } catch (err) { return out_({ ok: false, error: String(err) }); }
}
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = JSON.parse(e.postData.contents);
    const r = file_(body.code);
    const s = JSON.stringify(body.data);
    if (r.f) r.f.setContent(s); else DriveApp.createFile("tep-" + r.code + ".json", s, "application/json");
    return out_({ ok: true, t: Date.now() });
  } catch (err) { return out_({ ok: false, error: String(err) }); }
  finally { lock.releaseLock(); }
}`;

function markDirty() { try { localStorage.setItem(DK, "1"); } catch (e) { /* 忽略 */ } scheduleSync(20000); }
// 改寫 ls.set：觀念卡資料一變動就標記「待同步」
{ const raw = ls.set; ls.set = (k, v) => { raw(k, v); if (k.startsWith("tep-cards") && k !== PK) markDirty(); }; }

function collect() {
  const api = window.__TEP_API;
  return { app: "tep", v: 1, t: Date.now(), cards: ST, pos: ls.get(PK, {}), wrong: ls.get(WK, {}), wtomb: ls.get(TK, {}), hist: ls.get(HK, []), log: ls.get(GK, []), site: api && api.snapshot ? api.snapshot() : null, prefs: { rate: ls.get(RK, 1), auto: ls.get(AK, false) } };
}
function mergeIn(r) {
  if (!r || r.app !== "tep") throw new Error("不是教檢練習的備份檔");
  const raw = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 忽略 */ } };
  // 觀念卡自評：每張卡取較新的
  const cards = { ...ST };
  for (const [id, v] of Object.entries(r.cards || {})) if (!cards[id] || (v.t || 0) > (cards[id].t || 0)) cards[id] = v;
  ST = cards; raw(SK, ST);
  // 錯題本：聯集，被移出的以墓碑為準
  const tomb = { ...ls.get(TK, {}) };
  for (const [k, t] of Object.entries(r.wtomb || {})) tomb[k] = Math.max(tomb[k] || 0, t || 0);
  const lw = ls.get(WK, {}), rw = r.wrong || {}, wrong = {};
  for (const k of new Set([...Object.keys(lw), ...Object.keys(rw)])) {
    const a = lw[k], b = rw[k], p = !a ? b : !b ? a : (b.t > a.t ? b : a);
    if (p && p.t >= (tomb[k] || 0)) wrong[k] = p;
  }
  raw(TK, tomb); raw(WK, wrong);
  // 紀錄：依時間聯集
  const hk = (x) => `${x.t}|${x.scope}|${x.n}`;
  const hist = new Map(); [...ls.get(HK, []), ...(r.hist || [])].forEach((x) => hist.set(hk(x), x));
  raw(HK, [...hist.values()].sort((a, b) => a.t - b.t).slice(-300));
  const gk = (x) => `${x.t}|${x.b}|${x.ok}`;
  const log = new Map(); [...ls.get(GK, []), ...(r.log || [])].forEach((x) => log.set(gk(x), x));
  raw(GK, [...log.values()].sort((a, b) => a.t - b.t).slice(-3000));
  const pos = ls.get(PK, {}); for (const [k, v] of Object.entries(r.pos || {})) if (!(k in pos)) pos[k] = v; raw(PK, pos);
  const api = window.__TEP_API;
  if (r.site && api && api.merge) api.merge(r.site);
}

const syncCfg = () => ls.get(YK, {});
let syncTimer = null, syncing = false;
function scheduleSync(ms) {
  const c = syncCfg(); if (!c.url || !c.code) return;
  clearTimeout(syncTimer); syncTimer = setTimeout(() => cloudSync().catch(() => {}), ms);
}
async function cloudSync() {
  const c = syncCfg();
  if (!c.url || !c.code) throw new Error("還沒設定同步網址與同步碼");
  if (!navigator.onLine) throw new Error("目前離線，連線後會自動補傳");
  if (syncing) return;
  syncing = true;
  try {
    const g = await fetch(`${c.url}?code=${encodeURIComponent(c.code)}&t=${Date.now()}`).then((x) => x.json());
    if (!g.ok) throw new Error(g.error || "讀取失敗");
    if (g.data) mergeIn(g.data);
    const p = await fetch(c.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ code: c.code, data: collect() }) }).then((x) => x.json());
    if (!p.ok) throw new Error(p.error || "上傳失敗");
    try { localStorage.removeItem(DK); } catch (e) { /* 忽略 */ }
    const cfg = syncCfg(); cfg.last = Date.now(); cfg.err = ""; localStorage.setItem(YK, JSON.stringify(cfg));
    return true;
  } catch (e) {
    const cfg = syncCfg(); cfg.err = String(e.message || e); localStorage.setItem(YK, JSON.stringify(cfg));
    throw e;
  } finally { syncing = false; }
}
window.addEventListener("online", () => scheduleSync(1500));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") scheduleSync(2000); });
window.addEventListener("load", () => { if (localStorage.getItem(DK) || Date.now() - (syncCfg().last || 0) > 10 * 60 * 1000) scheduleSync(3000); });

function syncView() {
  app().append(navTabs("sync"), h("div", { class: "page-head" }, h("h1", null, "跨裝置備份"),
    h("p", { class: "lead" }, "觀念卡自評、測驗錯題本、測驗紀錄，加上網站原本的錯題本與作答統計，都可以備份或在電腦和手機之間同步。")));
  const c = syncCfg();
  const status = h("p", { class: "cd-verdict" });
  const drawStatus = () => {
    const s = syncCfg();
    if (!s.url || !s.code) { status.className = "cd-verdict"; status.textContent = "雲端同步：尚未設定。"; return; }
    const dirty = localStorage.getItem(DK);
    status.className = `cd-verdict ${s.err ? "bad" : "ok"}`;
    status.textContent = s.err ? `上次同步失敗：${s.err}` : `已設定。上次同步：${s.last ? fmtTime(s.last) : "還沒同步過"}${dirty ? "（有新紀錄待上傳）" : ""}`;
  };
  drawStatus();
  const url = h("input", { class: "cd-in", type: "url", placeholder: "https://script.google.com/macros/s/…/exec", value: c.url || "" });
  const code = h("input", { class: "cd-in", type: "text", placeholder: "至少 8 個英數字", value: c.code || "", autocomplete: "off" });
  const gen = h("button", { class: "btn ghost sm", type: "button", onclick: () => { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; code.value = Array.from(crypto.getRandomValues(new Uint8Array(10)), (x) => a[x % a.length]).join(""); } }, "產生新的同步碼");
  const now = h("button", { class: "btn", type: "button" }, "儲存並立即同步");
  now.onclick = async () => {
    const u = url.value.trim(), k = code.value.trim().replace(/[^A-Za-z0-9]/g, "");
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(u)) { alert("網址格式不對：要是 https://script.google.com/macros/s/……/exec"); return; }
    if (k.length < 8) { alert("同步碼至少 8 個英數字。"); return; }
    code.value = k;
    localStorage.setItem(YK, JSON.stringify({ ...syncCfg(), url: u, code: k }));
    now.disabled = true; now.textContent = "同步中…";
    try { await cloudSync(); alert("同步完成。"); } catch (e) { alert(`同步失敗：${e.message || e}`); }
    now.disabled = false; now.textContent = "儲存並立即同步"; drawStatus();
  };
  const off = h("button", { class: "link-btn", type: "button", onclick: () => { if (confirm("停用這台裝置的雲端同步？（雲端的備份檔不會刪除）")) { localStorage.removeItem(YK); location.reload(); } } }, "停用雲端同步");

  const fileIn = h("input", { type: "file", accept: ".json,application/json", hidden: true });
  fileIn.onchange = () => {
    const f = fileIn.files[0]; if (!f) return;
    f.text().then((t) => { mergeIn(JSON.parse(t)); alert("匯入完成（已和這台裝置的紀錄合併）。"); location.reload(); })
      .catch((e) => alert(`匯入失敗：${e.message || e}`));
  };
  const exp = h("button", { class: "btn", type: "button", onclick: () => {
    const d = new Date(), n = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(collect())], { type: "application/json" })), download: `教檢練習備份_${n}.json` });
    document.body.append(a); a.click(); a.remove();
  } }, "匯出備份檔");
  const imp = h("button", { class: "btn ghost", type: "button", onclick: () => fileIn.click() }, "匯入備份檔");
  const ta = h("textarea", { class: "cd-code", readonly: true, rows: 10 }); ta.value = GAS_CODE;
  const cp = h("button", { class: "btn ghost sm", type: "button", onclick: () => { ta.select(); (navigator.clipboard ? navigator.clipboard.writeText(GAS_CODE) : Promise.reject()).then(() => alert("已複製程式碼。"), () => { document.execCommand("copy"); alert("已複製程式碼。"); }); } }, "複製程式碼");

  app().append(
    h("article", { class: "qcard" }, h("h2", { class: "cd-h2" }, "雲端同步（電腦 ↔ 手機）"), status,
      h("label", { class: "cd-lab" }, "同步網址（Apps Script 網頁應用程式）", url),
      h("label", { class: "cd-lab" }, "同步碼（每台裝置填同一組）", code), h("p", null, gen),
      h("div", { class: "row cd-actions" }, now), off,
      h("p", { class: "small muted" }, "設定好之後會自動同步：打開網站時、有新紀錄的 20 秒後、離線後重新連上網時。離線時紀錄先存在這台裝置，連線後自動補傳。兩台裝置的紀錄會合併，不會互相覆蓋。")),
    h("article", { class: "qcard" }, h("h2", { class: "cd-h2" }, "檔案備份"),
      h("p", null, "不想設定雲端，也可以匯出成一個檔案，傳到另一台裝置再匯入。匯入是合併，不會清掉原本的紀錄。"),
      h("div", { class: "row cd-actions" }, exp, imp), fileIn),
    h("details", { class: "qcard sm" }, h("summary", null, h("b", null, "第一次設定雲端同步：建立 Apps Script")),
      h("ol", { class: "cd-steps" },
        h("li", null, "電腦打開 ", h("a", { href: "https://script.google.com/home/projects/create", target: "_blank", rel: "noopener" }, "script.google.com 新專案"), "。"),
        h("li", null, "把編輯器裡原本的程式碼全部刪掉，貼上下面的程式碼，按儲存。"),
        h("li", null, "右上角「部署」→「新增部署作業」→ 齒輪選「網頁應用程式」。"),
        h("li", null, "「執行身分」選「我」，「誰可以存取」選「所有人」，按「部署」。"),
        h("li", null, "第一次會要求授權：選你的 Google 帳號 →「進階」→「前往（不安全）」→「允許」。這是你自己的程式，只會讀寫你雲端硬碟裡的 tep-同步碼.json。"),
        h("li", null, "複製「網頁應用程式網址」（結尾是 /exec），貼到上面的同步網址，按「產生新的同步碼」，再按「儲存並立即同步」。"),
        h("li", null, "手機打開網站 → 觀念卡 → 備份，貼上同一個網址和同一組同步碼，按「儲存並立即同步」。")),
      h("p", null, cp), ta,
      h("p", { class: "small muted" }, "網址和同步碼等於這份紀錄的鑰匙，不要公開。紀錄只有學習進度，沒有密碼或個人資料。")));
}

function view() {
  stopTTS(); closePop(); viewerKeys = null;
  const qs = new URLSearchParams(location.hash.split("?")[1] || "");
  const b = Number(qs.get("b")) || 0, cs = qs.get("c");
  if (!Object.keys(IDX()).length) { app().append(h("p", null, "找不到觀念卡資料（data/cards.js）。")); return; }
  quizKeys = null;
  const v = qs.get("v");
  if (v === "quiz") return quizSetup(qs);
  if (v === "wrong") return wrongView();
  if (v === "hist") return histView();
  if (v === "sync") return syncView();
  if (!b) { subjects(qs.get("sys") === "old"); startDialog(); return; }
  if (cs == null) return chapters(b);
  return viewer(b, Number(cs) || 0, qs.get("f") || "all", qs.get("i"));
}

window.__TEP_VIEWS = Object.assign(window.__TEP_VIEWS || {}, { cards: view });
window.__TEP_VIEW_TITLES = Object.assign(window.__TEP_VIEW_TITLES || {}, { cards: "觀念卡" });
window.__TEP_CARDSTORE = { get: () => ST, save: (s) => { ST = s; save(); } };
})();
