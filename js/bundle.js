"use strict";
const __M={};

/* ===== config.js ===== */
(() => {
// 部署前可調整的設定。
// GOOGLE_CLIENT_ID：Google 登入的「用戶端 ID」（OAuth 2.0 Client ID，不是機密，可以公開）。
// 在 Google Cloud Console 建立「網頁應用程式」用戶端，已授權 JavaScript 來源需包含正式網址（https://teacher-exam-practice.pages.dev）與本機測試網址。
// 留空時登入功能停用（頁面會說明尚未設定）。
const GOOGLE_CLIENT_ID = ""; // 離線版：停用登入

// REPORT_API：「回報問題」表單送出的位置（本站的 Cloudflare Pages Function，見 functions/api/report.js）。
// 留空時不顯示回報連結。本機用 python http.server 預覽時沒有這個後端，送出會失敗；要測試請用 wrangler pages dev。
const REPORT_API = ""; // 離線版：停用回報

// CONTACT_EMAIL：（選填）「版權與資料來源」頁面額外公布的聯絡信箱。
// 選填。這是公開資訊，會顯示在版權頁；留空時版權頁只提供回報頁面作為聯絡方式（收件信箱在 Cloudflare 的加密設定，不會公開）。
const CONTACT_EMAIL = "";

// 官方歷屆試題頁（用來提供「回官網查原檔」連結）
const OFFICIAL_URL = "https://tqa.rcpet.edu.tw/TEA_Exam/TEA03.aspx";

// LITE：精簡版（只有題目與官方答案）。tools/make_dist.py --lite 產生上線資料夾時會把它改成 true；true 時不載入主題分類表，
// 即使伺服器或快取上殘留舊的 taxonomy.json，也不會出現主題、命題趨勢等功能。
const LITE = false;

// ---------- 導向 Sci-Flipper ----------
// 使用者直接開啟本站網址（不是從 Sci-Flipper 頁面內嵌開啟）時，會顯示說明並自動帶到 SF_PRACTICE_URL（本站內嵌的那一頁）。
// GATE_HOSTS：只有這些網域會導向；本機預覽、其他測試網址不受影響。要直接開啟本站（例如站長檢查回報信的連結），網址加上 ?direct=1。
const SF_PRACTICE_URL = "https://sites.google.com/view/sci-flipper/%E8%A9%A6%E9%A1%8C/%E6%95%99%E6%AA%A2%E6%AD%B7%E5%B1%86%E8%A9%A6%E9%A1%8C%E7%B7%B4%E7%BF%92";
const GATE_HOSTS = ["teacher-exam-practice.pages.dev"];

// SHOW_SF_BAR：是否在頁面最上方顯示 Sci-Flipper 共用頂欄。網站嵌在 Sci-Flipper 的 Google 協作平台頁面裡時，那裡已有橫幅，所以預設關閉；要獨立使用時改成 true。
const SHOW_SF_BAR = false;

// ---------- Sci-Flipper 共用頂欄 ----------
// SF_HOME：頂欄左側 logo 連到的社群首頁。
const SF_HOME = "https://sites.google.com/view/sci-flipper/home";
// SF_SITES：頂欄上的網站入口。current 為 true 的是目前這個網站；沒有填 url 的項目只顯示文字、不能點。
// 國中教育會考、科展等網站的網址確定後，把 url 填進來。
const SF_SITES = [
  { name: "教師檢定", url: "", current: true },
  { name: "國中會考", url: "" },
  { name: "科展", url: "" },
];

__M["config"] = { GOOGLE_CLIENT_ID, REPORT_API, CONTACT_EMAIL, OFFICIAL_URL, LITE, SF_PRACTICE_URL, GATE_HOSTS, SHOW_SF_BAR, SF_HOME, SF_SITES };
})();

/* ===== store.js ===== */
(() => {
// 學習紀錄先存在使用者自己的瀏覽器（localStorage）。
// 登入後會與雲端同步（見 sync.js）：錯題採用聯集，被移除的錯題以「墓碑」（tomb）記錄移除時間，避免另一台裝置把它帶回來；
// 作答次數與每日作答量取各自較大的值（都是只增不減的計數，不會重複相加）。
// localStorage 讀寫失敗（無痕模式、被封鎖）時退回記憶體，頁面仍可使用。
const KEY = "tqa-mid-v1";
let mem = null;
let onChange = null;

function read() {
  if (mem) return mem;
  try {
    mem = JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    mem = {};
  }
  mem.wrong ||= {};
  mem.tomb ||= {};
  mem.stats ||= {};
  mem.days ||= {};
  return mem;
}

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(mem));
  } catch { /* 忽略：改用記憶體 */ }
  onChange?.();
}

/** 紀錄有變動時呼叫（同步模組用來排程上傳）。 */
function onStateChange(fn) {
  onChange = fn;
}

/** 本地日期 YYYY-MM-DD（用來統計每天的作答量）。 */
function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 每題的累計作答：{ id: {c, w} }。 */
function stats() {
  return read().stats;
}

/** 最近 n 天（含今天）的作答量，由舊到新。 */
function lastDays(n = 7) {
  const days = read().days;
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = dayKey(d);
    out.push({ key: k, label: `${d.getMonth() + 1}/${d.getDate()}`, c: days[k]?.c || 0, w: days[k]?.w || 0 });
  }
  return out;
}

/** 連續練習天數（今天還沒練習時，從昨天往前算）。 */
function streak() {
  const days = read().days;
  let n = 0;
  const d = new Date();
  if (!(days[dayKey(d)]?.c + days[dayKey(d)]?.w)) d.setDate(d.getDate() - 1);
  while (days[dayKey(d)] && days[dayKey(d)].c + days[dayKey(d)].w > 0) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

function wrongIds() {
  return Object.keys(read().wrong);
}

function wrongCount() {
  return wrongIds().length;
}

/** 記錄一次作答。答錯加入錯題本；removeOnCorrect 為真時，答對就移出錯題本。 */
function record(id, correct, { removeOnCorrect = false } = {}) {
  const s = read();
  const st = (s.stats[id] ||= { c: 0, w: 0 });
  const day = (s.days[dayKey()] ||= { c: 0, w: 0 });
  day[correct ? "c" : "w"]++;
  if (correct) {
    st.c++;
    if (removeOnCorrect && s.wrong[id]) {
      delete s.wrong[id];
      s.tomb[id] = Date.now();
    }
  } else {
    st.w++;
    s.wrong[id] = { n: (s.wrong[id]?.n || 0) + 1, t: Date.now() };
  }
  write();
}

function removeWrong(id) {
  const s = read();
  if (s.wrong[id]) {
    delete s.wrong[id];
    s.tomb[id] = Date.now();
    write();
  }
}

function clearWrong() {
  const s = read();
  const now = Date.now();
  for (const id of Object.keys(s.wrong)) s.tomb[id] = now;
  s.wrong = {};
  write();
}

/** 要上傳的完整紀錄。 */
function snapshot() {
  const s = read();
  return { wrong: s.wrong, tomb: s.tomb, stats: s.stats, days: s.days };
}

/** 併入雲端的紀錄（不會觸發重複的上傳排程以外的副作用）。 */
function merge(r) {
  const s = read();
  const tomb = { ...s.tomb };
  for (const [id, t] of Object.entries(r.tomb || {})) tomb[id] = Math.max(tomb[id] || 0, t || 0);
  const rw = r.wrong || {};
  const wrong = {};
  for (const id of new Set([...Object.keys(s.wrong), ...Object.keys(rw)])) {
    const a = s.wrong[id];
    const b = rw[id];
    const pick = !a ? b : !b ? a : b.t > a.t ? b : a;
    if (pick && pick.t >= (tomb[id] || 0)) wrong[id] = pick;
  }
  s.wrong = wrong;
  s.tomb = tomb;
  for (const [id, v] of Object.entries(r.stats || {})) {
    const x = (s.stats[id] ||= { c: 0, w: 0 });
    x.c = Math.max(x.c, v.c || 0);
    x.w = Math.max(x.w, v.w || 0);
  }
  for (const [k, v] of Object.entries(r.days || {})) {
    const x = (s.days[k] ||= { c: 0, w: 0 });
    x.c = Math.max(x.c, v.c || 0);
    x.w = Math.max(x.w, v.w || 0);
  }
  write();
}

__M["store"] = { onStateChange, dayKey, stats, lastDays, streak, wrongIds, wrongCount, record, removeWrong, clearWrong, snapshot, merge };
})();

/* ===== ui.js ===== */
(() => {
// 介面小元件：圖示、環形圖、迷你走勢圖、七日長條圖、首頁插圖。全部是純 SVG，沒有外部相依。
const NS = "http://www.w3.org/2000/svg";

const ICONS = {
  practice: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8M13 12h8M13 18h8"/>',
  mock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2h5"/>',
  notebook: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-3.5L5 21V4a1 1 0 0 1 1-1z"/>',
  essay: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trend: '<path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  book: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
  text: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  sparkles: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4M17 5h4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  flag: '<path d="M4 22V4"/><path d="M4 4h13l-2 4 2 4H4"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2"/><path d="m6 6 1 14h10l1-14"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
};

function icon(name, cls = "") {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "ico " + cls);
  svg.innerHTML = ICONS[name] || "";
  return svg;
}

function svgEl(html, cls) {
  const wrap = document.createElement("span");
  wrap.className = cls || "";
  wrap.innerHTML = html;
  return wrap;
}

/** 環形圖：pct 0–100，中央顯示文字。 */
function ring(pct, { size = 132, label = "", sub = "" } = {}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return svgEl(
    `<svg viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="${label || pct + '%'}">
      <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--teal)"/></linearGradient></defs>
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--ring-track)" stroke-width="10"/>
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="url(#rg)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 60 60)" class="ring-arc"/>
      <text x="60" y="${sub ? 60 : 66}" text-anchor="middle" font-size="26" font-weight="800" fill="var(--ink)">${label || Math.round(pct) + "%"}</text>
      ${sub ? `<text x="60" y="80" text-anchor="middle" font-size="11" fill="var(--muted)">${sub}</text>` : ""}
    </svg>`,
    "ring"
  );
}

/** 迷你走勢圖：values 為依序的數值。 */
function sparkline(values, { w = 120, h = 34 } = {}) {
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => [i * step, h - 4 - (v / max) * (h - 8)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const last = pts[pts.length - 1];
  return svgEl(
    `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
      <path d="${area}" fill="var(--accent)" opacity=".1"/>
      <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.8" fill="var(--accent)"/>
    </svg>`,
    "spark"
  );
}

/** 七日長條圖：days = [{label, c, w}]，答對在下、答錯在上。 */
function bars7(days) {
  const W = 320;
  const H = 150;
  const max = Math.max(...days.map((d) => d.c + d.w), 5);
  const bw = 26;
  const gap = (W - days.length * bw) / (days.length + 1);
  let body = "";
  days.forEach((d, i) => {
    const x = gap + i * (bw + gap);
    const hc = (d.c / max) * (H - 54);
    const hw = (d.w / max) * (H - 54);
    const base = H - 24;
    body += `<rect x="${x}" y="${base - hc}" width="${bw}" height="${Math.max(hc, 0)}" rx="5" fill="var(--accent)" opacity=".92"/>`;
    if (d.w) body += `<rect x="${x}" y="${base - hc - hw - (hc ? 2 : 0)}" width="${bw}" height="${hw}" rx="5" fill="var(--bad)" opacity=".85"/>`;
    if (!d.c && !d.w) body += `<rect x="${x}" y="${base - 3}" width="${bw}" height="3" rx="1.5" fill="var(--line-strong)"/>`;
    const tot = d.c + d.w;
    if (tot) body += `<text x="${x + bw / 2}" y="${base - hc - hw - 8}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--ink-2)">${tot}</text>`;
    body += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">${d.label}</text>`;
  });
  return svgEl(`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="最近七天作答題數">${body}</svg>`, "bars7");
}

/** 首頁插圖：疊放的試卷、勾選與圖表。 */
function heroArt() {
  return svgEl(
    `<svg viewBox="0 0 440 360" role="img" aria-label="試卷與練習進度插圖">
      <defs>
        <linearGradient id="ha1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2d5bf0"/><stop offset="1" stop-color="#14b8a6"/></linearGradient>
        <linearGradient id="ha2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--surface)"/><stop offset="1" stop-color="var(--bg-alt)"/></linearGradient>
        <filter id="hsh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#1b3a8a" flood-opacity=".18"/></filter>
      </defs>
      <circle cx="330" cy="86" r="74" fill="url(#ha1)" opacity=".14"/>
      <circle cx="96" cy="288" r="58" fill="#f59e0b" opacity=".16"/>
      <g transform="rotate(-9 150 190)" filter="url(#hsh)"><rect x="62" y="64" width="212" height="262" rx="22" fill="url(#ha2)" stroke="var(--line)"/><rect x="86" y="92" width="120" height="12" rx="6" fill="var(--line-strong)"/><rect x="86" y="116" width="164" height="10" rx="5" fill="var(--line)"/></g>
      <g transform="rotate(5 280 200)" filter="url(#hsh)">
        <rect x="150" y="48" width="236" height="288" rx="24" fill="var(--surface)" stroke="var(--line)"/>
        <rect x="178" y="80" width="96" height="14" rx="7" fill="url(#ha1)"/>
        <rect x="178" y="106" width="168" height="10" rx="5" fill="var(--line-strong)"/>
        <rect x="178" y="124" width="132" height="10" rx="5" fill="var(--line)"/>
        <g font-family="system-ui" font-weight="700" font-size="13">
          <rect x="178" y="156" width="180" height="38" rx="12" fill="var(--accent-soft)" stroke="var(--accent)"/><circle cx="199" cy="175" r="11" fill="var(--accent)"/><path d="m193.5 175 4 4 7-8" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="220" y="169" width="104" height="10" rx="5" fill="var(--accent)" opacity=".35"/>
          <rect x="178" y="204" width="180" height="38" rx="12" fill="var(--surface)" stroke="var(--line-strong)"/><circle cx="199" cy="223" r="11" fill="none" stroke="var(--line-strong)" stroke-width="2"/><rect x="220" y="217" width="84" height="10" rx="5" fill="var(--line)"/>
          <rect x="178" y="252" width="180" height="38" rx="12" fill="var(--surface)" stroke="var(--line-strong)"/><circle cx="199" cy="271" r="11" fill="none" stroke="var(--line-strong)" stroke-width="2"/><rect x="220" y="265" width="112" height="10" rx="5" fill="var(--line)"/>
        </g>
      </g>
      <g filter="url(#hsh)"><rect x="318" y="262" width="96" height="66" rx="18" fill="var(--surface)" stroke="var(--line)"/>
        <rect x="334" y="302" width="10" height="14" rx="3" fill="url(#ha1)" opacity=".5"/><rect x="351" y="290" width="10" height="26" rx="3" fill="url(#ha1)" opacity=".75"/><rect x="368" y="278" width="10" height="38" rx="3" fill="url(#ha1)"/>
      </g>
      <g filter="url(#hsh)"><circle cx="64" cy="112" r="26" fill="#f59e0b"/><path d="m52 112 8 8 14-16" stroke="#fff" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
    </svg>`,
    "hero-art"
  );
}

__M["ui"] = { icon, ring, sparkline, bars7, heroArt };
})();

/* ===== sf-bar.js ===== */
(() => {
// Sci-Flipper 共用頂欄：不依賴本站其他程式，只需要 css/sf-bar.css 與 img/ 的 logo，其他網站可直接複製使用。
const { SF_HOME, SF_SITES, SF_PRACTICE_URL, GATE_HOSTS, SHOW_SF_BAR } = __M["config"];

/** 是否被嵌在別的頁面（例如 Google 協作平台）裡。 */
const EMBEDDED = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true; // 跨網域讀不到 top，代表一定是被嵌入
  }
})();

const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, v === true ? "" : v);
  e.append(...kids.filter((k) => k != null));
  return e;
};

/** 直接開啟本站（沒有被 Sci-Flipper 頁面內嵌）時要不要改導向到 Sci-Flipper。?direct=1 可跳過（本次分頁有效）。 */
function shouldGate() {
  if (EMBEDDED || !SF_PRACTICE_URL || !GATE_HOSTS.includes(location.hostname)) return false;
  try {
    if (new URLSearchParams(location.search).get("direct") === "1") sessionStorage.setItem("sf-direct", "1");
    if (sessionStorage.getItem("sf-direct") === "1") return false;
  } catch {}
  return true;
}

/** 顯示說明頁並在幾秒後自動前往 Sci-Flipper。 */
function showGate() {
  const go = h("a", { class: "sf-go", href: SF_PRACTICE_URL, rel: "noopener" }, "前往 Sci-Flipper 網站練習");
  const box = h("main", { class: "sf-gate" },
    h("img", { src: "img/sf-lockup-light.png", alt: "Sci-Flipper", width: "240", decoding: "async" }),
    h("h1", {}, "Sci-Flipper 教師資格考試練習平台"),
    h("p", {}, "本練習系統請從 Sci-Flipper 翻轉•跨領域•專業學習社群網站使用，正在帶你前往…"),
    go);
  document.body.replaceChildren(box);
  setTimeout(() => location.replace(SF_PRACTICE_URL), 2000);
}

function mountSfBar() {
  if (EMBEDDED) document.documentElement.classList.add("embedded");
  if (!SHOW_SF_BAR) return;
  const mark = (v) => h("img", { class: `sf-mark sf-${v}`, src: `img/sf-mark-${v}-96.png`, alt: "", width: "22", height: "22", decoding: "async" });
  const brand = h("a", { class: "sf-brand", href: SF_HOME, target: "_blank", rel: "noopener", "aria-label": "Sci-Flipper 翻轉・跨領域・專業學習社群（另開新分頁）" },
    mark("light"), mark("dark"), h("b", {}, "Sci-Flipper"), h("span", { class: "sf-tag" }, "翻轉•跨領域•專業學習社群"));
  const nav = h("nav", { class: "sf-sites", "aria-label": "Sci-Flipper 網站" },
    ...SF_SITES.map((s) => (s.current ? h("span", { class: "on", "aria-current": "page" }, s.name)
      : s.url ? h("a", { href: s.url, target: "_blank", rel: "noopener" }, s.name)
      : h("span", { class: "soon", title: "即將推出" }, s.name))));
  const bar = h("div", { class: "sfbar" }, h("div", { class: "sf-in" }, brand, nav), h("i", { class: "sf-line", "aria-hidden": "true" }));
  document.querySelector(".site-header")?.before(bar);
}

__M["sf-bar"] = { EMBEDDED, shouldGate, showGate, mountSfBar };
})();

/* ===== session.js ===== */
(() => {
// 登入狀態與後端呼叫。
// 站內登入憑證放在請求的 Authorization 標頭，不使用 cookie（本站常嵌在 Google 協作平台框內，第三方 cookie 會被瀏覽器擋）。
// 憑證同時存在記憶體與 localStorage／sessionStorage（都包 try/catch）；儲存失敗時，重新整理後要再登入一次。
const { GOOGLE_CLIENT_ID } = __M["config"];

const KEY = "tqa-session";
let mem = null;
const listeners = new Set();

function decodeExp(token) {
  try {
    const body = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(body.padEnd(Math.ceil(body.length / 4) * 4, "=")))?.exp || 0;
  } catch {
    return 0;
  }
}

function load() {
  if (mem !== null) return mem;
  let t = null;
  for (const store of [sessionStorage, localStorage]) {
    try {
      t = t || store.getItem(KEY);
    } catch { /* 忽略 */ }
  }
  mem = t && decodeExp(t) * 1000 > Date.now() ? t : "";
  return mem;
}

function save(t) {
  mem = t || "";
  for (const store of [sessionStorage, localStorage]) {
    try {
      if (t) store.setItem(KEY, t);
      else store.removeItem(KEY);
    } catch { /* 忽略 */ }
  }
  listeners.forEach((fn) => fn(signedIn()));
}

/** 目前的登入憑證；沒有或已過期回傳 null。 */
function token() {
  const t = load();
  return t && decodeExp(t) * 1000 > Date.now() ? t : null;
}

const signedIn = () => !!token();

/** 登入狀態改變時（登入、登出、憑證失效）呼叫 fn(signedIn)。 */
function onSessionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const loginAvailable = () => !!GOOGLE_CLIENT_ID;

function signOut() {
  save("");
}

/** 呼叫後端 API。未登入或憑證失效（401）時會清除登入狀態，回傳 null；其他錯誤也回傳 null，並附上 status。 */
async function api(path, { method = "GET", body } = {}) {
  const t = token();
  if (!t) return null;
  let res;
  try {
    res = await fetch(`/api/${path}`, {
      method,
      headers: { Authorization: `Bearer ${t}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (res.status === 401) {
    signOut();
    return null;
  }
  if (!res.ok) return null;
  return res.json();
}

/** 把 Google 登入回傳的 credential 換成站內憑證。 */
async function exchangeCredential(credential) {
  const res = await fetch("/api/auth/google", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) throw new Error(data.error || String(res.status));
  save(data.token);
  return true;
}

let gisPromise = null;
/** 需要時才載入 Google 登入按鈕的程式（不影響一般頁面載入）。 */
function loadGis() {
  if (window.google?.accounts?.id) return Promise.resolve();
  gisPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisPromise = null;
      reject(new Error("gis"));
    };
    document.head.append(s);
  });
  return gisPromise;
}

/** 在 container 內畫出 Google 登入按鈕；登入成功後呼叫 onDone()。 */
async function mountGoogleButton(container, { onDone, onError, dark = false }) {
  await loadGis();
  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    ux_mode: "popup",
    auto_select: false,
    callback: async ({ credential }) => {
      try {
        await exchangeCredential(credential);
        onDone?.();
      } catch (e) {
        onError?.(e);
      }
    },
  });
  window.google.accounts.id.renderButton(container, {
    type: "standard",
    theme: dark ? "filled_black" : "outline",
    size: "large",
    text: "continue_with",
    shape: "pill",
    locale: "zh-TW",
    width: 280,
  });
}

__M["session"] = { token, signedIn, onSessionChange, loginAvailable, signOut, api, exchangeCredential, loadGis, mountGoogleButton };
})();

/* ===== sync.js ===== */
(() => {
// 登入後的學習紀錄同步：登入時先下載雲端紀錄並併入本機，再上傳合併後的結果；之後紀錄每次變動，約 1.5 秒後自動上傳。
// 未登入時不會上傳任何東西。
const store = __M["store"];
const { api, signedIn } = __M["session"];

let timer = null;
let busy = false;
let again = false; // 上傳途中又有變動：上傳結束後再傳一次
let lastOk = null;
const statusListeners = new Set();

const syncStatus = () => ({ on: signedIn(), last: lastOk });
function onSyncStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}
const emit = () => statusListeners.forEach((fn) => fn(syncStatus()));

async function push() {
  if (!signedIn()) return false;
  if (busy) {
    again = true;
    return false;
  }
  busy = true;
  let ok = false;
  try {
    const r = await api("progress", { method: "PUT", body: store.snapshot() });
    if (r?.ok) lastOk = r.updated;
    ok = !!r?.ok;
  } finally {
    busy = false;
    emit();
    if (again) {
      again = false;
      setTimeout(push, 0);
    }
  }
  return ok;
}

/** 下載雲端紀錄、併入本機，再把合併後的結果上傳。 */
async function pull() {
  if (!signedIn()) return false;
  const r = await api("progress");
  if (!r) return false;
  if (r.data) store.merge(r.data);
  return push();
}

store.onStateChange(() => {
  if (!signedIn()) return;
  clearTimeout(timer);
  timer = setTimeout(push, 1500);
});

__M["sync"] = { syncStatus, onSyncStatus, pull };
})();

/* ===== app.js ===== */
(() => {
const { REPORT_API, OFFICIAL_URL, CONTACT_EMAIL, LITE } = __M["config"];
const store = __M["store"];
const { icon, ring, sparkline, bars7 } = __M["ui"];
const { mountSfBar, shouldGate, showGate } = __M["sf-bar"];
const { signedIn, onSessionChange, api, signOut, mountGoogleButton, loginAvailable } = __M["session"];
const { pull, syncStatus } = __M["sync"];

/* ---------- 小工具 ---------- */
const $ = (s, r = document) => r.querySelector(s);

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, "");
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

/** 像 append，但略過 null／false。 */
function add(parent, ...kids) {
  kids.flat().forEach((k) => k != null && k !== false && parent.append(k));
  return parent;
}

const fmtNum = (n) => String(Math.round(n * 10) / 10);
const fmtInt = (n) => Number(n).toLocaleString("en-US");
const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- 資料 ---------- */
let Q = [];
let META = null;
const byId = new Map();
const SUBS = () => META.subjects;
const subName = (k) => SUBS()[k].name;
const CAT_ORDER = ["S", "E", "K", "SD", "SG"];
const catShort = (q) => META.categories[q.cl].short;
const catName = (cl) => META.categories[cl].name;
const catShortName = (cl) => META.categories[cl].short;
/** 共同題在各類科試卷各出現一次；主題目所屬類科有被選時，不重複顯示其他類科的版本。 */
const hiddenDup = (q, cats) => !!q.d && cats.has(byId.get(q.d)?.cl);

/* 主題分類表（沒有 taxonomy.json 時網站仍可運作，只是沒有主題功能） */
let TAX = null;
const L1 = new Map();
const L2 = new Map();
const TAGNAME = new Map();

async function loadData() {
  const [q, m] = await Promise.all([
    Promise.resolve(window.__TEP_Q),
    Promise.resolve(window.__TEP_META),
  ]);
  Q = q;
  META = m;
  Q.forEach((x) => byId.set(x.id, x));
  await loadPremium();
}

/** 登入後才載入的加值內容：主題分類表與每題的標註（主題、詳解旗標）。未登入或精簡版時不載入。 */
async function loadPremium() {
  if (LITE || !signedIn()) return false;
  const [tax, extras] = await Promise.all([api("premium/taxonomy"), api("premium/extras")]);
  if (!tax || !extras) return false;
  Object.entries(extras).forEach(([id, x]) => {
    const q = byId.get(id);
    if (q) Object.assign(q, x);
  });
  TAX = tax;
  TAX.l1.forEach((a) => {
    L1.set(a.code, a);
    a.l2.forEach((b) => L2.set(b.code, { ...b, l1: a.code }));
  });
  TAX.tags.forEach((t) => TAGNAME.set(t.code, t.name));
  return true;
}

function topicName(code) {
  const t = L2.get(code);
  if (!t) return code === "OT" ? "其他" : code;
  return `${L1.get(t.l1).name}／${t.name}`;
}
const l1Of = (code) => L2.get(code)?.l1;

/** 題目的主題資訊（答題後或瀏覽時顯示）。 */
function topicLine(q) {
  if (!TAX || !q.tp) return null;
  const row = el("div", { class: "meta", style: "margin:12px 0 0" }, el("span", { class: "tag teal" }, `主題：${topicName(q.tp)}`));
  if (q.alt) row.append(el("span", { class: "tag plain" }, `相關：${topicName(q.alt)}`));
  (q.tg || []).forEach((t) => row.append(el("span", { class: "tag plain" }, TAGNAME.get(t))));
  if (q.tc === "low") row.append(el("span", { class: "small muted" }, "（AI 分類，信心較低）"));
  return row;
}

const mcq = () => Q.filter((q) => q.t === "m");
const essays = () => Q.filter((q) => q.t === "e");
const yearLabel = (q) => `${q.y}年${q.ss ? `第${q.ss}次` : ""}`;
const years = (list) => [...new Set(list.map((q) => q.y))].sort((a, b) => b - a);
const isCorrect = (q, letter) => q.a.includes(letter);

function qLabel(q) {
  return q.ex ? `${q.y}年 範例題 第${q.n}題` : `${yearLabel(q)} ${catShort(q)} ${subName(q.sub)} 第${q.n}題`;
}

function ansLabel(q) {
  if (q.a.length === q.o.length && q.o.length > 1) return `${q.o.map((_, i) => "ABCDE"[i]).join("、")} 皆給分`;
  return q.a.join(" 或 ");
}

function ruleNote(q) {
  const notes = [];
  if (q.rule === "任一選項給分") notes.push("本題經疑義審議後送分，任一選項皆給分。");
  else if (q.rule) notes.push(`本題${q.rule}。`);
  else if (q.dis === "維持原答案") notes.push("本題曾被提出疑義，官方審議後維持原答案。");
  if (q.nt) notes.push(q.nt);
  return notes;
}

/** 科目的視覺代表：新制／舊制／共同科目用不同圖示與色調。 */
function subVisual(sub) {
  const s = SUBS()[sub];
  if (sub === "CL") return { ic: "text", cls: "teal", tag: "common" };
  if (sub === "MA") return { ic: "calc", cls: "amber", tag: "common" };
  return s.sys === "新制" ? { ic: "layers", cls: "", tag: "" } : { ic: "book", cls: "", tag: "old" };
}
const sysTag = (sub) => el("span", { class: `sys-tag ${subVisual(sub).tag}` }, SUBS()[sub].sys);

/* ---------- 共用元件 ---------- */
function tagRow(q, no) {
  return el(
    "div",
    { class: "meta" },
    no != null ? el("span", { class: "qno" }, no) : null,
    el("span", { class: "tag" }, `${catShort(q)}・${subName(q.sub)}`),
    el("span", { class: "tag plain" }, q.ex ? `${q.y}年 範例題` : yearLabel(q)),
    el("span", {}, `第 ${q.n} 題`),
    q.sc ? el("span", {}, `${fmtNum(q.sc)} 分`) : null,
    q.dis !== undefined ? el("span", { class: "tag warn" }, "曾有疑義") : null,
    q.fig ? el("span", { class: "tag warn", title: "此題含圖或表" }, q.sub === "MA" ? "數學題・公式以原卷截圖為準" : q.cr || q.gcr ? "含圖表・已附原卷截圖" : "含圖表・請看原卷") : null,
    q.ocr ? el("span", { class: "tag warn", title: "此年度 PDF 為掃描檔，文字由 OCR 轉錄，並已對照原卷頁面校對，仍可能有少數錯字" }, "OCR 轉錄") : null,
    q.chk ? el("span", { class: "tag warn", title: "PDF 文字層缺少題號或格式特殊，依結構切分，請對照原卷" }, "待校對") : null
  );
}

function pageViewer(q) {
  const stem = q.f.replace(/\.pdf$/i, "");
  const total = META.pageCount[q.f] || q.p;
  let page = q.p;
  const img = el("img", { alt: "", loading: "lazy" });
  const label = el("span");
  const prev = el("button", { class: "link-btn", type: "button", onclick: () => go(-1) }, "◀ 上一頁");
  const next = el("button", { class: "link-btn", type: "button", onclick: () => go(1) }, "下一頁 ▶");
  const panel = el("div", { class: "pv-panel", hidden: true }, el("div", { class: "pv-nav" }, prev, label, next), img);
  const wrap = el("div", { class: "pv" });
  function go(d) {
    page = Math.min(total, Math.max(1, page + d));
    draw();
  }
  function draw() {
    img.src = `pages/${encodeURI(stem)}-p${page}.jpg`;
    img.alt = `${qLabel(q)} 原卷第 ${page} 頁`;
    label.textContent = `原卷第 ${page} / ${total} 頁`;
    prev.disabled = page <= 1;
    next.disabled = page >= total;
  }
  const btn = el(
    "button",
    {
      class: "link-btn",
      type: "button",
      "aria-expanded": "false",
      onclick: () => {
        panel.hidden = !panel.hidden;
        wrap.classList.toggle("open", !panel.hidden);
        btn.setAttribute("aria-expanded", String(!panel.hidden));
        btn.lastChild.textContent = panel.hidden ? `看原卷第 ${q.p} 頁` : "收起原卷";
        if (!panel.hidden && !img.src) draw();
      },
    },
    icon("eye"),
    document.createTextNode(`看原卷第 ${q.p} 頁`)
  );
  if (q.fig && !q.cr && !q.gcr) btn.click(); // 含圖表但沒能自動裁圖（雙欄版面）：直接展開原卷頁面
  return add(wrap, btn, panel);
}

/** 原卷截圖（figures/）。點圖開大圖。 */
function figImgs(files, label) {
  if (!files || !files.length) return null;
  return el("div", { class: "figs" },
    el("div", { class: "fig-label" }, label),
    ...files.map((f) => el("a", { href: `figures/${f}`, target: "_blank", rel: "noopener", title: "開啟大圖" },
      el("img", { src: `figures/${f}`, alt: `${label}（原卷截圖）`, loading: "lazy" }))));
}

function reportTools(q) {
  const copyLabel = document.createTextNode(`複製題號 ${q.id}`);
  const copy = el(
    "button",
    {
      class: "link-btn",
      type: "button",
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(q.id);
          copyLabel.textContent = "已複製題號";
        } catch {
          copyLabel.textContent = `題號：${q.id}`;
        }
      },
    },
    icon("copy"),
    copyLabel
  );
  const link = REPORT_API ? el("a", { class: "link-btn", href: `#/report?id=${encodeURIComponent(q.id)}` }, icon("flag"), "回報此題有誤") : null;
  return el("div", { class: "tools" }, pageViewer(q), copy, link);
}

/** 一題選擇題。state: {picked, locked}；onPick(letter) 於點選時呼叫。 */
function mcqCard(q, { picked = null, locked = false, showCtx = true, onPick = null, review = false, no = null } = {}) {
  const card = el("article", { class: "qcard", "data-id": q.id });
  card.append(tagRow(q, no));
  if (q.ctx && showCtx) add(card, el("div", { class: "ctx" }, el("div", { class: "ctx-label" }, icon("book"), "題組情境"), el("p", {}, q.ctx), figImgs(q.gcr, "題組共用的圖表")));
  else if (showCtx && q.gcr) card.append(figImgs(q.gcr, "題組共用的圖表"));
  card.append(el("p", { class: "stem" }, q.q));
  if (q.sub === "MA" && q.cr) card.append(el("p", { class: "small muted" }, "數學公式與圖形由 PDF 擷取，文字可能不完整；請以下方原卷截圖為準。"));
  add(card, figImgs(q.cr, "本題原卷截圖"));
  const opts = el("div", { class: "opts", role: "group", "aria-label": "選項" });
  q.o.forEach((text, i) => {
    const L = "ABCDE"[i];
    const b = el(
      "button",
      { class: "opt", type: "button", "data-letter": L, disabled: locked, onclick: () => onPick && onPick(L) },
      el("span", { class: "letter" }, L),
      el("span", { class: "otext" }, text)
    );
    if (locked) {
      if (isCorrect(q, L)) {
        b.classList.add("correct");
        b.append(el("span", { class: "mark" }, icon("check"), "正確答案"));
      } else if (picked === L) {
        b.classList.add("wrong");
        b.append(el("span", { class: "mark" }, icon("x"), "你的選擇"));
      }
    } else if (picked === L) {
      b.classList.add("picked");
      b.setAttribute("aria-pressed", "true");
    }
    opts.append(b);
  });
  card.append(opts);
  if (locked && (review || picked !== undefined)) card.append(feedback(q, picked));
  card.append(reportTools(q));
  return card;
}

/* ---------- 詳解（AI 草稿） ---------- */
/* 詳解是登入專屬內容：一題一題向伺服器要（每人每天有次數上限）。 */
const expCache = new Map();
function loadExp(key) {
  if (!expCache.has(key)) {
    expCache.set(key, api(`premium/exp/${encodeURIComponent(key)}`).then((r) => {
      if (!r) throw new Error("exp");
      return r;
    }).catch((e) => { expCache.delete(key); throw e; }));
  }
  return expCache.get(key);
}

function renderExp(q, it) {
  const box = el("div", { class: "exp-body" },
    el("div", { class: "exp-head" }, el("span", { class: "tag warn" }, "AI 草稿"), el("span", { class: "small muted" }, "僅供學習參考，請以官方答案與教科書為準")),
    el("p", { class: "exp-why" }, it.w),
    el("ul", { class: "exp-opts" }, ...Object.entries(it.o).map(([L, t]) => el("li", { class: isCorrect(q, L) ? "ok" : "" }, el("span", { class: "letter" }, L), el("span", {}, t)))),
    it.c?.length ? el("div", { class: "exp-concepts" }, el("span", { class: "small muted" }, "考點"), ...it.c.map((c) => el("span", { class: "tag" }, c))) : null,
    it.f === "outdated_law" ? el("p", { class: "small muted" }, `法規提醒：${it.n || "本題涉及的法規後來可能修正，請以現行規定為準。"}`) : null,
    it.f === "need_figure" ? el("p", { class: "small muted" }, `需對照圖表：${it.n || "本題需看原卷圖表才能完整判斷。"}`) : null,
    el("p", { class: "small", style: "margin:10px 0 0" }, el("a", { href: `#/report?id=${encodeURIComponent(q.id)}&type=explain` }, "詳解有誤或看不懂？回報"))
  );
  return box;
}

function explainBlock(q) {
  const holder = el("div", { class: "explain", hidden: true });
  const label = document.createTextNode("看詳解");
  let loaded = false;
  const btn = el("button", { class: "link-btn exp-btn", type: "button", "aria-expanded": "false", onclick: async () => {
    holder.hidden = !holder.hidden;
    btn.setAttribute("aria-expanded", String(!holder.hidden));
    label.textContent = holder.hidden ? "看詳解" : "收起詳解";
    if (holder.hidden || loaded) return;
    holder.textContent = "載入中…";
    try {
      const it = await loadExp(q.d || q.id);
      holder.replaceChildren(it ? renderExp(q, it) : el("p", { class: "small muted" }, "這題目前沒有詳解。"));
      loaded = true;
    } catch {
      holder.textContent = signedIn() ? "詳解載入失敗，請稍後再試（或今天的查詢次數已用完）。" : "登入已過期，請重新登入後再試。";
    }
  } }, icon("book"), label);
  return el("div", { class: "exp-wrap" }, btn, holder);
}

/* 離線版加值：答錯時自動展開該題觀念的整體講解（data/concepts.js） */
function conceptBlock(q, open) {
  const code = (window.__TEP_CONCEPT || {})[q.d || q.id] || (window.__TEP_CONCEPT || {})[q.id];
  const note = code && (window.__TEP_NOTES || {})[code];
  if (!note) return null;
  const d = el("details", { class: "concept" });
  d.open = !!open;
  d.append(el("summary", {}, el("span", { class: "concept-k" }, "觀念講解"), el("b", {}, note.t)));
  note.s.forEach(([h, lines]) => {
    d.append(el("h4", {}, h));
    const ul = el("ul", {});
    lines.forEach((t) => ul.append(el("li", {}, t)));
    d.append(ul);
  });
  if ((window.__TEP_AUTO || {})[q.id]) d.append(el("p", { class: "small muted" }, "這題的觀念是依關鍵詞自動歸類的，可能不完全對應本題；若不符，請以題目內容為準。"));
  d.append(el("p", { class: "small muted" }, "此講解為自編的觀念整理，非官方詳解，內容若與教科書不同請以教科書為準。"));
  return d;
}


/* 離線版加值：七冊專書「書中精講」（data/guide.js + data/book/*.js） */
const BOOKS = () => window.__TEP_BOOKS || [];
const bookCache = {};
function loadChapter(b, c) {
  const k = `${b}-${c}`;
  if ((window.__TEP_BK || {})[k]) return Promise.resolve(window.__TEP_BK[k]);
  if (bookCache[k]) return bookCache[k];
  bookCache[k] = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = `data/book/b${b}c${String(c).padStart(2, "0")}.js`;
    s.onload = () => ((window.__TEP_BK || {})[k] ? res(window.__TEP_BK[k]) : rej(new Error("empty")));
    s.onerror = () => { delete bookCache[k]; rej(new Error("load")); };
    document.head.append(s);
  });
  return bookCache[k];
}
function htmlBox(cls, html) {
  const d = el("div", { class: cls });
  d.innerHTML = html;
  return d;
}
function bookInfo(b, c) {
  const bk = BOOKS().find((x) => x.b === b);
  const ch = bk && bk.ch.find((x) => x.c === c);
  return { bk, ch };
}
function guideOf(q) {
  const G = window.__TEP_GUIDE || {};
  return G[q.id] || (q.d && G[q.d]) || null;
}
function bookBlock(q, open) {
  const g = guideOf(q);
  if (!g) return null;
  const [b, c, si, kind] = g;
  const qid = (window.__TEP_GUIDE || {})[q.id] ? q.id : q.d;
  const { bk, ch } = bookInfo(b, c);
  const d = el("details", { class: "concept bookref" });
  d.open = !!open;
  const secTitle = ch && ch.s[si] ? ch.s[si] : "";
  d.append(el("summary", {}, el("span", { class: "concept-k" }, kind === 1 ? "書中精解" : "書中簡解"),
    el("b", {}, `第${b}冊 第${c}章`), el("span", { class: "muted small" }, `　${ch ? ch.t : ""}`)));
  const body = el("div", { class: "bookref-body" }, el("p", { class: "muted small" }, "載入中…"));
  d.append(body);
  let loaded = false;
  const fill = () => {
    if (loaded) return;
    loaded = true;
    loadChapter(b, c).then((data) => {
      body.replaceChildren();
      const a = data.ana[qid];
      if (a) body.append(htmlBox("bk-ana", a.a));
      const sec = data.secs[si];
      if (sec) {
        const sd = el("details", { class: "bk-sec" });
        sd.append(el("summary", {}, el("span", { class: "concept-k" }, "對應觀念"), el("b", {}, sec.h)));
        sd.append(htmlBox("bk-html", sec.html));
        body.append(sd);
      }
      body.append(el("p", { class: "small" }, el("a", { class: "link-btn", href: `#/book?b=${b}&c=${c}&s=${si}` }, icon("book"), `閱讀整章：${bk ? bk.name : ""} 第${c}章`)));
      if (kind === 2) body.append(el("p", { class: "small muted" }, "簡解為本系列專書的補充說明，答案依官方公布答案；非官方詳解。"));
    }).catch(() => { loaded = false; body.replaceChildren(el("p", { class: "small muted" }, "專書內容載入失敗（請確認 data/book 資料夾存在）。")); });
  };
  d.addEventListener("toggle", () => d.open && fill());
  if (open) fill();
  return d;
}

/* ---------- 專書閱讀 ---------- */
function bookView() {
  const qs = new URLSearchParams((location.hash.split("?")[1] || ""));
  const b = Number(qs.get("b")) || 0, c = Number(qs.get("c")) || 0, s = qs.get("s");
  const books = BOOKS();
  if (!books.length) { app().append(el("p", {}, "找不到專書資料（data/guide.js）。")); return; }
  if (!b) {
    const out = el("div", { class: "page-head" }, el("h1", {}, "七冊專書"), el("p", { class: "lead" }, "每一題考古題作答後都可展開「書中精解／簡解」，也可以在這裡按章閱讀。"));
    app().append(out);
    books.forEach((bk) => {
      const card = el("article", { class: "qcard sm" }, el("h2", { style: "margin:0 0 8px;font-size:19px" }, `第${bk.b}冊　${bk.name}`));
      let part = "";
      const ul = el("ul", { class: "bk-toc" });
      bk.ch.forEach((ch) => {
        if (ch.p && ch.p !== part) { part = ch.p; ul.append(el("li", { class: "bk-part" }, part)); }
        ul.append(el("li", {}, el("a", { href: `#/book?b=${bk.b}&c=${ch.c}` }, `第${ch.c}章　${ch.t}`), el("span", { class: "muted small" }, `　${ch.n} 題`)));
      });
      card.append(ul);
      app().append(card);
    });
    return;
  }
  const { bk, ch } = bookInfo(b, c);
  if (!bk || !ch) { location.hash = "#/book"; return; }
  const head = el("div", { class: "page-head" },
    el("p", { class: "small" }, el("a", { href: "#/book" }, "七冊專書"), ` ／ 第${b}冊 ${bk.name}`),
    el("h1", {}, `第${c}章　${ch.t}`));
  const nav = el("div", { class: "row", style: "margin:6px 0 18px;gap:10px" },
    c > 1 ? el("a", { class: "btn ghost", href: `#/book?b=${b}&c=${c - 1}` }, "← 上一章") : null,
    c < bk.ch.length ? el("a", { class: "btn ghost", href: `#/book?b=${b}&c=${c + 1}` }, "下一章 →") : null,
    el("button", { class: "btn", type: "button", onclick: () => {
      const items = mcq().filter((q) => { const g = guideOf(q); return g && g[0] === b && g[1] === c && q.cl === "S"; }).sort((x, y) => x.y - y.y || x.n - y.n);
      if (items.length) startQuiz({ mode: "practice", nav: "practice", title: `第${b}冊第${c}章 考古題`, items });
    } }, "練習本章考古題"));
  const body = el("article", { class: "qcard bk-read" }, el("p", { class: "muted" }, "載入中…"));
  app().append(head, nav, body);
  loadChapter(b, c).then((data) => {
    body.replaceChildren();
    const toc = el("details", { class: "bk-sec", open: true }, el("summary", {}, el("b", {}, "本章目錄")));
    const tl = el("ul", { class: "bk-toc" });
    data.secs.forEach((sec, i) => tl.append(el("li", { class: sec.lv === 3 ? "sub" : "" }, el("a", { href: `#/book?b=${b}&c=${c}&s=${i}` }, sec.h))));
    toc.append(tl);
    body.append(toc);
    const full = Object.values(data.ana).filter((v) => v.full);
    const anaBox = () => {
      const box = el("section", { class: "bk-s" }, el("h2", {}, "四、歷屆試題解析"));
      full.forEach((v) => box.append(htmlBox("bk-html bk-q", v.full)));
      return box;
    };
    let anaDone = !full.length;
    data.secs.forEach((sec, i) => {
      if (!anaDone && sec.lv === 2 && sec.h.startsWith("五")) { body.append(anaBox()); anaDone = true; }
      const box = el("section", { id: `bk-s${i}`, class: "bk-s" }, el(sec.lv === 3 ? "h3" : "h2", {}, sec.h));
      box.append(htmlBox("bk-html", sec.html));
      body.append(box);
    });
    if (!anaDone) body.append(anaBox());
    if (s != null) { const t = document.getElementById(`bk-s${s}`); if (t) t.scrollIntoView(); }
  }).catch(() => body.replaceChildren(el("p", {}, "本章內容載入失敗。")));
}

function feedback(q, picked) {
  const ok = picked != null && isCorrect(q, picked);
  const kind = picked == null ? "none" : ok ? "ok" : "bad";
  const f = el("div", { class: `feedback ${kind}`, role: "status" }, el("span", { class: "fic" }, icon(kind === "ok" ? "check" : kind === "bad" ? "x" : "clock")));
  const body = el("div", { class: "fbody" }, el("strong", {}, picked == null ? "未作答" : ok ? "答對了" : "答錯了"), el("span", {}, `　官方答案：${ansLabel(q)}`));
  ruleNote(q).forEach((n) => body.append(el("p", {}, n)));
  add(body, topicLine(q), q.x ? explainBlock(q) : null, !signedIn() && !LITE && loginAvailable() ? loginHint() : null);
  if (q.ocr) body.append(el("p", { class: "small muted" }, "此題文字由 OCR 轉錄，若選項或題幹看起來怪怪的，請點「看原卷」對照。"));
  { const bb = bookBlock(q, kind === "bad"); if (bb) body.append(bb); }
  { const cb = conceptBlock(q, false); if (cb) body.append(cb); }
  f.append(body);
  return f;
}

/* ---------- 路由 ---------- */
let timer = null;
let keyHandler = null;
let session = null;
const app = () => $("#app");
const TITLES = { book: "七冊專書", home: "", practice: "自由練習", mock: "模擬考", notebook: "錯題本與學習紀錄", essay: "問答題", trend: "命題趨勢", about: "說明", legal: "版權與資料來源", report: "回報問題", quiz: "作答中", account: "登入與同步" };

function route() {
  clearInterval(timer);
  keyHandler = null;
  const name = (location.hash.replace(/^#\/?/, "") || "home").split("?")[0];
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("on", a.dataset.r === name || (name === "quiz" && a.dataset.r === session?.nav)));
  const view = { book: bookView, home, practice, mock, notebook, essay, trend, about, legal, report, quiz, account }[name] || home;
  app().replaceChildren();
  view();
  const t = TITLES[name] ?? "";
  document.title = t ? `${t}｜Sci-Flipper 教師資格考試練習平台` : "Sci-Flipper 教師資格考試練習平台｜歷屆試題線上練習";
  refreshBadge();
  window.scrollTo(0, 0);
  app().focus({ preventScroll: true });
}

function refreshBadge() {
  const n = store.wrongCount();
  const b = $("#nb-count");
  b.hidden = n === 0;
  b.textContent = n;
}

document.addEventListener("keydown", (e) => {
  if (keyHandler && !e.metaKey && !e.ctrlKey && !e.altKey && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) keyHandler(e);
});

function goPractice() {
  if (location.hash === "#/practice") route();
  else location.hash = "#/practice";
}

/* ---------- 首頁 ---------- */
let homeCat = "S";

/** 把設定套到「自由練習」再進入該頁。opts: {cats, subs, years, fig, topics} */
function applyPreset(opts = {}) {
  const m = mcq();
  filt.cats = new Set(opts.cats || CAT_ORDER);
  filt.subs = new Set(opts.subs || []);
  filt.years = new Set(opts.years || years(m));
  filt.topics = new Set(opts.topics || []);
  filt.tags = new Set();
  filt.fig = opts.fig || "all";
  filt.noOcr = false;
  filt.kw = "";
  goPractice();
}

function home() {
  const m = mcq();
  const uniq = (list) => list.filter((q) => !q.d).length;
  const stats = store.stats();
  const allYears = years(Q);
  const newSubs = Object.keys(SUBS()).filter((k) => SUBS()[k].sys === "新制");
  const oldSubs = Object.keys(SUBS()).filter((k) => SUBS()[k].sys === "舊制");
  const maxY = Math.max(...allYears);

  const stat = (ic, cls, value, label) =>
    el("div", { class: "stat-card" }, el("span", { class: `ic ${cls}` }, icon(ic)), el("div", {}, el("b", {}, value), el("span", {}, label)));
  const preset = (ic, text, fn) => el("button", { class: "preset", type: "button", onclick: fn }, icon(ic), text);
  const feature = (href, cls, ic, title, text) =>
    el("a", { class: "card", href }, el("div", { class: `icon ${cls}` }, icon(ic)), el("h3", {}, title), el("p", {}, text), el("span", { class: "go" }, "開始", icon("arrow")));

  // 類科 × 科目 卡片
  const cards = el("div", { class: "scards" });
  const tabs = el("div", { class: "tabs", role: "tablist", "aria-label": "選擇類科" });
  const drawCards = () => {
    tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.cl === homeCat)));
    cards.replaceChildren();
    Object.keys(SUBS()).forEach((sub, i) => {
      const list = Q.filter((q) => q.cl === homeCat && q.sub === sub && q.t === "m");
      if (!list.length) return;
      const ys = years(list);
      const done = list.filter((q) => stats[q.id]).length;
      const v = subVisual(sub);
      const card = el(
        "article",
        { class: "scard", style: `animation-delay:${i * 30}ms` },
        el("div", { class: "scard-top" }, el("span", { class: `scard-ic ${v.cls}` }, icon(v.ic)),
          el("div", {}, el("h3", {}, subName(sub), sysTag(sub)), el("div", { class: "meta-line" }, `${ys[ys.length - 1]}–${ys[0]} 年・${fmtInt(list.length)} 題`))),
        el("div", {}, el("div", { class: "pbar" }, el("i", { style: `width:${(done / list.length) * 100}%` })),
          el("div", { class: "pmeta" }, el("span", {}, done ? `已練習 ${fmtInt(done)} 題` : "尚未開始"), el("span", {}, `${Math.round((done / list.length) * 100)}%`))),
        el("div", { class: "scard-actions" },
          el("button", { class: "btn", type: "button", onclick: () => applyPreset({ cats: [homeCat], subs: [sub] }) }, "練習"),
          el("button", { class: "btn ghost", type: "button", onclick: () => { mockCat = homeCat; location.hash = "#/mock"; } }, "模擬考"))
      );
      cards.append(card);
    });
  };
  CAT_ORDER.forEach((cl) => {
    if (!Q.some((q) => q.cl === cl)) return;
    tabs.append(el("button", { class: "tab", type: "button", role: "tab", "data-cl": cl, onclick: () => { homeCat = cl; drawCards(); } }, catName(cl)));
  });

  app().append(
    el(
      "section",
      { class: "hero2" },
      el("picture", { class: "hero2-pic" },
        el("source", { media: "(max-width: 720px)", srcset: "img/hero-mobile.webp" }),
        el("img", { src: "img/hero-wide.webp", alt: "走廊盡頭，一扇打開的教室門，陽光灑進教室", width: "1600", height: "900", decoding: "async", fetchpriority: "high" })),
      el("div", { class: "hero2-copy" },
        el("h1", {}, "願有一天，", el("br"), "你推開教室的門，", el("br"), el("em", {}, "仍記得自己為何出發。")),
        el("p", { class: "hero2-lead" }, "我們相信，每一位想成為老師的人，", el("br"), "都值得擁有好好準備的機會。", el("br"), "從一道題開始，按照自己的步調，", el("br"), "慢慢走向那間即將相遇的教室。"),
        el("div", { class: "hero-cta" }, el("a", { class: "btn lg", href: "#/practice" }, "開始練習", icon("arrow")), el("a", { class: "btn lg ghost", href: "#/mock" }, "模擬考試")))
    ),
    el("div", { class: "stat-cards" },
      stat("list", "", fmtInt(uniq(m)), "選擇題（不重複）"),
      stat("essay", "teal", fmtInt(uniq(essays())), "問答／綜合題"),
      stat("grid", "amber", Object.keys(META.categories).length, "個類科"),
      stat("clock", "", `${allYears[allYears.length - 1]}–${maxY}`, "年度範圍")),
    el("div", { class: "notice", hidden: signedIn() || LITE || !loginAvailable() ? true : null },
      icon("sparkles"),
      el("div", {}, el("b", {}, "登入即可解鎖"), "每題的 AI 詳解、主題分類與命題趨勢；錯題本與學習紀錄可跨裝置同步。", " ", el("a", { href: "#/account" }, "前往登入"))),
    el("div", { class: "sec-head" }, el("div", {}, el("h2", {}, "快速開始"), el("p", {}, "一鍵套用常用範圍，再到設定頁微調。"))),
    el("div", { class: "presets" },
      preset("layers", "新制三科（110–115）", () => applyPreset({ subs: newSubs })),
      preset("book", "舊制各科（94–109）", () => applyPreset({ subs: oldSubs })),
      preset("text", "國語文能力測驗", () => applyPreset({ subs: ["CL"] })),
      preset("calc", "國小數學能力測驗", () => applyPreset({ cats: ["E"], subs: ["MA"] })),
      preset("flame", `最近三年（${maxY - 2}–${maxY}）`, () => applyPreset({ years: allYears.filter((y) => y >= maxY - 2) }))),
    el("div", { class: "sec-head" }, el("div", {}, el("h2", {}, "功能"))),
    el(
      "div",
      { class: "grid cols3" },
      feature("#/practice", "", "practice", "自由練習", TAX ? "依科目、年度、主題、關鍵字篩題，答完立刻看答案與原卷。" : "依科目、年度、關鍵字篩題，答完立刻看答案與原卷。"),
      feature("#/mock", "teal", "mock", "模擬考", "整份歷屆試卷依原題序作答，交卷後算分並逐題檢討。"),
      feature("#/notebook", "amber", "notebook", `錯題本與學習紀錄（${store.wrongCount()}）`, "答錯自動收集，並用圖表看出你的弱項與練習節奏。")
    ),
    el("div", { class: "sec-head" }, el("div", {}, el("h2", {}, "選擇你的類科"), el("p", {}, "每個科目的題數、年份範圍與你的練習進度。"))),
    tabs,
    cards,
    el(
      "div",
      { class: "notice" },
      icon("info"),
      el("div", {}, el("b", {}, "收錄進度："),
        "五個類科的新制教育專業三科（110–115 年）、舊制各科（94–109 年，另有 107 年官方範例題；94–97、100 年為掃描試卷，OCR 轉錄後對照原卷校對），以及各類科共同的國語文能力測驗（94–115 年）與國小數學能力測驗（103–115 年）。各類科共用的題目不會重複計入題數。舊制題目可能引用已修正的法規或舊課綱，作答前請留意時效。")
    )
  );
  drawCards();
}

/* ---------- 自由練習 ---------- */
const filt = { cats: null, subs: null, years: null, topics: new Set(), tags: new Set(), fig: "all", noOcr: false, kw: "", count: "20", order: "random" };

function matches(q) {
  if (q.t !== "m" || !filt.cats.has(q.cl) || (filt.subs.size && !filt.subs.has(q.sub)) || !filt.years.has(q.y)) return false;
  if (hiddenDup(q, filt.cats)) return false;
  if (filt.topics.size && !filt.topics.has(q.tp)) return false;
  if (filt.tags.size && !(q.tg || []).some((t) => filt.tags.has(t))) return false;
  if (filt.fig === "skip" && q.fig) return false;
  if (filt.fig === "only" && !q.fig) return false;
  if (filt.noOcr && q.ocr) return false;
  if (filt.kw) {
    const hay = q.q + (q.ctx || "") + q.o.join("");
    if (!filt.kw.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

function chipGroup(name, items, selected, onChange) {
  const wrap = el("div", { class: "chips" });
  items.forEach(({ value, text, small }) => {
    const input = el("input", { type: "checkbox", name, value: String(value) });
    input.checked = selected.has(value);
    input.addEventListener("change", () => {
      input.checked ? selected.add(value) : selected.delete(value);
      onChange();
    });
    wrap.append(el("label", { class: "chip" }, input, el("span", {}, text, small ? el("small", {}, small) : null)));
  });
  return wrap;
}

/** 主題選擇器：一級分類為可展開群組，二級分類為可複選的 chip（不選＝全部主題）。 */
function topicPicker(m, update) {
  const counts = new Map();
  m.forEach((q) => q.tp && counts.set(q.tp, (counts.get(q.tp) || 0) + 1));
  const groups = [...TAX.l1];
  if (counts.has("OT")) groups.push({ code: "OT", name: "其他", l2: [{ code: "OT", name: "其他／無法歸類" }] });
  const wrap = el("div");
  const shown = groups.filter((a) => a.l2.some((b) => counts.get(b.code)));
  const refreshers = [];
  shown.forEach((a) => {
    const total = a.l2.reduce((s, b) => s + (counts.get(b.code) || 0), 0);
    const badge = el("span", { class: "muted small" });
    const det = el("details", { class: "tgroup" }, el("summary", {}, el("b", {}, a.name), badge));
    const refresh = () => {
      const n = a.l2.filter((b) => filt.topics.has(b.code)).length;
      badge.textContent = n ? `已選 ${n}／共 ${total} 題` : `${total} 題`;
    };
    refresh();
    refreshers.push(refresh);
    det.open = a.l2.some((b) => filt.topics.has(b.code));
    det.append(chipGroup("topic", a.l2.filter((b) => counts.get(b.code) || filt.topics.has(b.code)).map((b) => ({ value: b.code, text: b.name, small: String(counts.get(b.code) || 0) })), filt.topics, () => { refresh(); update(); }));
    wrap.append(det);
  });
  const clear = el("button", { class: "link-btn", type: "button", onclick: () => {
    filt.topics.clear();
    wrap.querySelectorAll("input[name=topic]").forEach((i) => (i.checked = false));
    refreshers.forEach((r) => r());
    update();
  } }, "清除主題");
  wrap.append(el("div", { style: "margin:6px 0 14px" }, clear));
  return wrap;
}

function practice() {
  const m = mcq();
  filt.subs ||= new Set(); // 空＝全部科目
  filt.years ||= new Set(years(m));
  filt.cats ||= new Set(CAT_ORDER);
  const countEl = el("span", { class: "count-num" });
  const startBtn = el("button", { class: "btn lg block", type: "button" }, "開始練習", icon("arrow"));
  const mCount = el("div", { class: "mcount" });
  const mStart = el("button", { class: "btn", type: "button" }, "開始練習");
  const dl = el("dl");
  const subBox = el("div");
  const rebuildSubjects = () => {
    const avail = new Set(m.filter((q) => filt.cats.has(q.cl)).map((q) => q.sub));
    [...filt.subs].forEach((k) => !avail.has(k) && filt.subs.delete(k));
    subBox.replaceChildren();
    ["新制", "舊制", "共同科目"].forEach((sys) => {
      const items = Object.entries(SUBS()).filter(([k, sb]) => sb.sys === sys && avail.has(k)).map(([k, sb]) => ({ value: k, text: sb.name }));
      if (!items.length) return;
      subBox.append(el("div", { class: "chip-group-label" }, sys === "新制" ? "新制（110–115 年）" : sys === "舊制" ? "舊制（94–109 年）" : "共同科目"), chipGroup("sub", items, filt.subs, update));
    });
  };
  const topicBox = el("div");
  const rebuildTopics = () => {
    if (!TAX) return;
    const pool = m.filter((q) => filt.cats.has(q.cl) && !hiddenDup(q, filt.cats));
    // 換類科後，已選的主題若在新範圍內沒有題目，就取消選取（否則會看不見卻讓結果變 0 題）
    const available = new Set(pool.map((q) => q.tp));
    [...filt.topics].forEach((c) => !available.has(c) && filt.topics.delete(c));
    topicBox.replaceChildren(topicPicker(pool, update));
  };
  const summaryRows = () => {
    const cats = CAT_ORDER.filter((c) => filt.cats.has(c));
    const allYs = years(m);
    const ys = allYs.filter((y) => filt.years.has(y));
    const subs = [...filt.subs];
    const rows = [
      ["類科", cats.length === CAT_ORDER.length ? "全部" : cats.map(catShortName).join("、") || "—"],
      ["科目", !subs.length ? "全部" : subs.length <= 2 ? subs.map(subName).join("、") : `${subs.length} 科`],
      ["年度", !ys.length ? "—" : ys.length === allYs.length ? `${allYs[allYs.length - 1]}–${allYs[0]}` : ys.length <= 3 ? ys.join("、") : `${ys[ys.length - 1]}–${ys[0]}（${ys.length} 個）`],
    ];
    if (TAX) rows.push(["主題", filt.topics.size ? `${filt.topics.size} 個` : "全部"]);
    rows.push(["作答", `${filt.count === "all" ? "全部" : filt.count + " 題"}・${filt.order === "random" ? "隨機" : "依序"}`]);
    return rows;
  };
  const update = () => {
    const n = m.filter(matches).length;
    countEl.textContent = fmtInt(n);
    mCount.replaceChildren(`${fmtInt(n)} 題`, el("small", {}, "符合目前條件"));
    startBtn.disabled = mStart.disabled = n === 0;
    dl.replaceChildren(...summaryRows().map(([k, v]) => el("div", {}, el("dt", {}, k), el("dd", {}, v))));
  };
  const yearChips = chipGroup("year", years(m).map((y) => ({ value: y, text: String(y) })), filt.years, update);
  const setYears = (pred) => {
    filt.years.clear(); // 就地改，chipGroup 持有的是同一個 Set
    years(m).filter(pred).forEach((y) => filt.years.add(y));
    yearChips.querySelectorAll("input").forEach((i) => (i.checked = filt.years.has(Number(i.value))));
    update();
  };

  const kw = el("input", { type: "search", placeholder: "例：布魯姆、形成性評量", "aria-label": "關鍵字", value: filt.kw });
  kw.addEventListener("input", () => { filt.kw = kw.value.trim(); update(); });
  const figSel = el("select", { "aria-label": "圖表題" }, el("option", { value: "all" }, "全部"), el("option", { value: "only" }, "只看含圖表的題目"), el("option", { value: "skip" }, "略過含圖表的題目"));
  figSel.value = filt.fig;
  figSel.addEventListener("change", () => { filt.fig = figSel.value; update(); });
  const noOcr = el("input", { type: "checkbox" });
  noOcr.checked = filt.noOcr;
  noOcr.addEventListener("change", () => { filt.noOcr = noOcr.checked; update(); });
  const count = el("select", { "aria-label": "題數" }, ...["10", "20", "50", "all"].map((v) => el("option", { value: v }, v === "all" ? "全部" : `${v} 題`)));
  count.value = filt.count;
  count.addEventListener("change", () => { filt.count = count.value; update(); });
  const order = el("select", { "aria-label": "順序" }, el("option", { value: "random" }, "隨機"), el("option", { value: "ordered" }, "依年度、題號"));
  order.value = filt.order;
  order.addEventListener("change", () => { filt.order = order.value; update(); });

  const start = () => {
    let items = m.filter(matches);
    items = filt.order === "random" ? shuffle(items) : items.sort((a, b) => a.y - b.y || (a.ss || 0) - (b.ss || 0) || a.n - b.n);
    if (filt.count !== "all") items = items.slice(0, Number(filt.count));
    startQuiz({ mode: "practice", nav: "practice", title: "自由練習", items });
  };
  startBtn.addEventListener("click", start);
  mStart.addEventListener("click", start);

  const step = (n, title, hint, ...kids) =>
    el("section", { class: "step" }, el("div", { class: "step-head" }, el("span", { class: "step-num" }, n), el("h2", {}, title), hint ? el("span", { class: "hint" }, hint) : null), ...kids);

  rebuildSubjects();
  rebuildTopics();
  const newSubs = Object.keys(SUBS()).filter((k) => SUBS()[k].sys === "新制");
  const oldSubs = Object.keys(SUBS()).filter((k) => SUBS()[k].sys === "舊制");
  const quick = (ic, text, fn) => el("button", { class: "preset", type: "button", onclick: fn }, icon(ic), text);
  app().append(
    el("div", { class: "page-head" }, el("h1", {}, "自由練習"), el("p", { class: "lead" }, "三個步驟挑好範圍，隨時看到符合的題數。")),
    el("div", { class: "presets", style: "margin-bottom:22px" },
      quick("layers", "新制三科", () => applyPreset({ subs: newSubs })),
      quick("book", "舊制各科", () => applyPreset({ subs: oldSubs })),
      quick("text", "國語文", () => applyPreset({ subs: ["CL"] })),
      quick("calc", "國小數學", () => applyPreset({ cats: ["E"], subs: ["MA"] })),
      quick("refresh", "重設全部", () => applyPreset({}))),
    el(
      "div",
      { class: "setup" },
      el("div", { class: "setup-main" },
        step(1, "選範圍", "類科與科目",
          el("fieldset", {}, el("legend", {}, "類科"), chipGroup("cat", CAT_ORDER.map((c) => ({ value: c, text: catName(c) })), filt.cats, () => { rebuildSubjects(); rebuildTopics(); update(); }),
            el("p", { class: "small muted", style: "margin:8px 0 0" }, "各類科共用的題目只會出現一次。")),
          el("fieldset", {}, el("legend", {}, "科目（不選＝全部）"), subBox)),
        step(2, "選年度", "預設全部年度",
          el("fieldset", {}, yearChips,
            el("div", { class: "row small", style: "margin-top:10px" },
              el("button", { class: "link-btn", type: "button", onclick: () => setYears(() => true) }, "全選"),
              el("button", { class: "link-btn", type: "button", onclick: () => setYears((y) => y >= 110) }, "只選新制 110–115"),
              el("button", { class: "link-btn", type: "button", onclick: () => setYears((y) => y < 110) }, "只選舊制 94–109"),
              el("button", { class: "link-btn", type: "button", onclick: () => setYears(() => false) }, "全不選")))),
        step(3, "進階條件", "主題、關鍵字與作答設定",
          TAX ? el("fieldset", {}, el("legend", {}, "主題（可複選，不選＝全部）"), topicBox,
            el("div", { class: "chip-group-label" }, "特別標籤（符合任一即可）"),
            chipGroup("tag", TAX.tags.map((t) => ({ value: t.code, text: t.name })), filt.tags, update),
            el("p", { class: "small muted", style: "margin:10px 0 0" }, "一級分類依官方命題範圍；二級分類與標籤為 AI 依題意標註，僅供篩題參考。主題清單會依你選的類科調整。")) : null,
          el("fieldset", {}, el("legend", {}, "作答設定"),
            el("div", { class: "row", style: "align-items:flex-end" },
              el("label", { class: "field", style: "flex:1;min-width:200px" }, "關鍵字（空白分隔，需全部符合）", kw),
              el("label", { class: "field" }, "題數", count),
              el("label", { class: "field" }, "順序", order),
              el("label", { class: "field" }, "圖表題", figSel)),
            el("label", { class: "check", style: "margin-top:14px" }, noOcr, "略過 OCR 轉錄的題目（94–97、100 年）")))
      ),
      el("aside", { class: "summary", "aria-label": "目前的篩選摘要" },
        el("div", { class: "small muted", style: "font-weight:700;letter-spacing:.06em" }, "符合條件"),
        el("div", { class: "count" }, countEl, el("small", {}, "題")),
        dl, startBtn,
        el("p", { class: "small muted", style: "margin:12px 0 0;text-align:center" }, el("span", { class: "kbd" }, "A–D"), " 或 ", el("span", { class: "kbd" }, "1–4"), " 鍵可快速作答")),
    ),
    el("div", { class: "mbar" }, mCount, mStart)
  );
  update();
}

/* ---------- 作答流程（自由練習／錯題本） ---------- */
function startQuiz(s) {
  session = { ...s, idx: 0, answers: {}, started: Date.now() };
  if (location.hash === "#/quiz") route();
  else location.hash = "#/quiz";
}

function quiz() {
  if (!session) return void (location.hash = "#/practice");
  if (session.mode === "mock") return mockExam();
  const { items, idx } = session;
  if (idx >= items.length) return quizResult();
  const q = items[idx];
  const picked = session.answers[q.id];
  const locked = picked !== undefined;
  const root = app();
  const nextBtn = el("button", { class: "btn lg", type: "button", onclick: next }, idx + 1 === items.length ? "看結果" : "下一題", icon("arrow"));

  function pick(L) {
    if (session.answers[q.id] !== undefined) return;
    session.answers[q.id] = L;
    store.record(q.id, isCorrect(q, L), { removeOnCorrect: session.mode === "notebook" });
    refreshBadge();
    quiz2();
  }
  function next() {
    session.idx++;
    quiz2();
    window.scrollTo(0, 0);
  }
  function quiz2() {
    root.replaceChildren();
    quiz();
  }
  const done = items.slice(0, idx + (locked ? 1 : 0));
  const right = done.filter((x) => session.answers[x.id] !== undefined && isCorrect(x, session.answers[x.id])).length;
  const wrong = done.filter((x) => session.answers[x.id] !== undefined && !isCorrect(x, session.answers[x.id])).length;

  root.append(
    el("div", { class: "qtop" },
      el("h1", {}, session.title),
      el("div", { class: "live" }, el("span", { class: "ok" }, icon("check"), ` ${right}`), el("span", { class: "bad" }, icon("x"), ` ${wrong}`), el("span", { class: "n" }, `${idx + 1} / ${items.length}`))),
    el("div", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(items.length), "aria-valuenow": String(idx) }, el("i", { style: `width:${((idx + (locked ? 1 : 0)) / items.length) * 100}%` })),
    mcqCard(q, { picked: locked ? picked : null, locked, onPick: pick, no: idx + 1 }),
    el("div", { class: "quizbar" },
      locked ? el("span", { class: "muted small" }, el("span", { class: "kbd" }, "Enter"), " 下一題") : el("span", { class: "muted small" }, "點選選項作答，也可按鍵盤 ", el("span", { class: "kbd" }, "A–D"), " / ", el("span", { class: "kbd" }, "1–4")),
      el("div", { class: "row" },
        el("button", { class: "link-btn", type: "button", onclick: () => { if (confirm("結束本次練習？")) quizResult(true); } }, "提前結束"),
        locked ? nextBtn : null))
  );
  if (locked) nextBtn.focus({ preventScroll: true });

  keyHandler = (e) => {
    const k = e.key.toUpperCase();
    if (!locked) {
      const i = "ABCDE".indexOf(k) >= 0 ? "ABCDE".indexOf(k) : "12345".indexOf(k);
      if (i >= 0 && i < q.o.length) pick("ABCDE"[i]);
    } else if (e.key === "Enter" || e.key === "ArrowRight") {
      e.preventDefault();
      next();
    }
  };
}

function resultHero({ title, lead, pct, ringLabel, ringSub, stats, actions }) {
  return el("section", { class: "result" },
    ring(pct, { size: 150, label: ringLabel, sub: ringSub }),
    el("div", {}, el("h1", {}, title), el("p", { class: "lead" }, lead),
      el("div", { class: "rstats" }, ...stats.map(([cls, v, l]) => el("div", { class: cls }, el("b", {}, v), l))),
      el("div", { class: "actions", style: "margin-top:0" }, ...actions)));
}

function quizResult(early = false) {
  const root = app();
  root.replaceChildren();
  keyHandler = null;
  const done = session.items.filter((q) => session.answers[q.id] !== undefined);
  const right = done.filter((q) => isCorrect(q, session.answers[q.id]));
  const wrong = done.filter((q) => !isCorrect(q, session.answers[q.id]));
  const pct = done.length ? Math.round((right.length / done.length) * 100) : 0;
  root.append(
    resultHero({
      title: early ? "已結束練習" : "練習完成",
      lead: `答對率 ${pct}%，用時 ${fmtTime(Date.now() - session.started)}。答錯的題目已加入錯題本。`,
      pct, ringSub: "答對率",
      stats: [["ok", right.length, "答對"], ["bad", wrong.length, "答錯"], ["", done.length, "已作答"]],
      actions: [
        wrong.length ? el("button", { class: "btn", type: "button", onclick: () => startQuiz({ mode: "practice", nav: session.nav, title: "重做答錯的題目", items: shuffle(wrong) }) }, icon("refresh"), `重做答錯的 ${wrong.length} 題`) : null,
        el("a", { class: "btn ghost", href: `#/${session.nav}` }, "回設定"),
        el("a", { class: "btn ghost", href: "#/notebook" }, "看學習紀錄"),
      ],
    })
  );
  if (wrong.length) {
    root.append(el("h2", {}, "答錯的題目"));
    wrong.forEach((q) => root.append(mcqCard(q, { picked: session.answers[q.id], locked: true, review: true })));
  }
}

/* ---------- 模擬考 ---------- */
let mockCat = "S";
function papers() {
  const map = new Map();
  mcq().filter((q) => !q.ex).forEach((q) => {
    const k = `${q.cl}-${q.sub}-${q.y}-${q.ss || 0}`;
    const p = map.get(k) || { cl: q.cl, sub: q.sub, y: q.y, ss: q.ss || 0, n: 0, score: 0, ocr: false };
    p.n++;
    p.score += q.sc || 0;
    p.ocr ||= !!q.ocr;
    map.set(k, p);
  });
  return [...map.values()];
}

function mock() {
  const all = papers();
  const body = el("div");
  const tabs = el("div", { class: "tabs", role: "tablist", "aria-label": "選擇類科" });
  const draw = () => {
    tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.cl === mockCat)));
    body.replaceChildren();
    const cl = mockCat;
    const inCat = all.filter((p) => p.cl === cl);
    Object.entries(SUBS()).forEach(([k, s]) => {
      const list = inCat.filter((p) => p.sub === k).sort((a, b) => b.y - a.y || b.ss - a.ss);
      if (!list.length) return;
      const v = subVisual(k);
      body.append(
        el("div", { class: "subhead" }, el("span", { class: `scard-ic ${v.cls}`, style: "width:34px;height:34px;border-radius:10px" }, icon(v.ic)), s.name, sysTag(k)),
        el("div", { class: "grid cols3", style: "gap:12px" },
          ...list.map((p) => el("div", { class: "paper" },
            el("div", {}, el("b", {}, `${p.y} 年${p.ss ? `第${p.ss}次` : ""}`), el("div", { class: "muted small" }, `${p.n} 題・${fmtNum(p.score)} 分${p.ocr ? "・OCR 轉錄" : ""}`)),
            el("button", { class: "btn", type: "button", style: "min-height:42px;padding:6px 18px", onclick: () => startQuiz({ mode: "mock", nav: "mock", title: `${p.y} 年${p.ss ? `第${p.ss}次` : ""} ${catName(cl)} ${s.name}`, items: mcq().filter((q) => q.cl === cl && q.sub === k && q.y === p.y && (q.ss || 0) === p.ss && !q.ex).sort((a, b) => a.n - b.n), submitted: false }) }, "開始"))))
      );
    });
  };
  CAT_ORDER.forEach((cl) => {
    if (!all.some((p) => p.cl === cl)) return;
    tabs.append(el("button", { class: "tab", type: "button", role: "tab", "data-cl": cl, onclick: () => { mockCat = cl; draw(); } }, catName(cl)));
  });
  app().append(
    el("div", { class: "page-head" }, el("h1", {}, "模擬考"), el("p", { class: "lead" }, "整份歷屆試卷的選擇題，依原題序作答，交卷後才顯示答案與得分。問答題與綜合題請至「問答題」頁瀏覽。")),
    tabs, body
  );
  draw();
}

function mockExam() {
  const { items } = session;
  const root = app();
  const total = items.reduce((a, q) => a + (q.sc || 0), 0);
  const rerender = () => { root.replaceChildren(); mockExam(); };

  if (session.submitted) {
    const right = items.filter((q) => isCorrect(q, session.answers[q.id]));
    const got = right.reduce((a, q) => a + (q.sc || 0), 0);
    root.append(
      resultHero({
        title: `${session.title}`,
        lead: `答對 ${right.length} / ${items.length} 題，用時 ${session.elapsed}。答錯與未答的題目已加入錯題本。`,
        pct: total ? (got / total) * 100 : 0, ringLabel: fmtNum(got), ringSub: `滿分 ${fmtNum(total)}`,
        stats: [["ok", right.length, "答對"], ["bad", items.length - right.length, "答錯或未答"], ["", session.elapsed, "用時"]],
        actions: [el("a", { class: "btn ghost", href: "#/mock" }, "選其他試卷"), el("a", { class: "btn ghost", href: "#/notebook" }, "看學習紀錄")],
      }),
      el("h2", {}, "逐題檢討")
    );
    let lastGrp = null;
    items.forEach((q, i) => {
      root.append(mcqCard(q, { picked: session.answers[q.id] ?? null, locked: true, review: true, showCtx: !q.grp || q.grp !== lastGrp, no: i + 1 }));
      lastGrp = q.grp || null;
    });
    return;
  }

  const answered = () => Object.keys(session.answers).length;
  const clock = el("span", { class: "timer" }, icon("clock"), fmtTime(Date.now() - session.started));
  const clockText = clock.lastChild;
  const cnt = el("span", { class: "muted" });
  const bar = el("i", { style: "width:0%" });
  const refreshCount = () => { cnt.textContent = `已作答 ${answered()} / ${items.length}`; bar.style.width = `${(answered() / items.length) * 100}%`; };
  refreshCount();
  clearInterval(timer);
  timer = setInterval(() => (clockText.textContent = fmtTime(Date.now() - session.started)), 1000);

  root.append(
    el("div", { class: "page-head" }, el("h1", {}, session.title), el("p", { class: "lead", style: "margin-bottom:10px" }, `共 ${items.length} 題，滿分 ${fmtNum(total)} 分。答案可以隨時修改，交卷後才會顯示對錯。`)),
    el("div", { class: "progress" }, bar)
  );
  items.forEach((q, i) => {
    const showCtx = !q.grp || q.grp !== (items[i - 1]?.grp || null);
    const holder = el("div");
    const draw = () => {
      holder.replaceChildren(mcqCard(q, { picked: session.answers[q.id] ?? null, showCtx, no: i + 1, onPick: (L) => { session.answers[q.id] = L; draw(); refreshCount(); } }));
    };
    draw();
    root.append(holder);
  });

  root.append(
    el("div", { class: "stickybar" }, el("div", { class: "wrap" },
      el("div", { class: "row" }, clock, cnt),
      el("button", {
        class: "btn", type: "button", onclick: () => {
          const left = items.length - answered();
          if (left && !confirm(`還有 ${left} 題未作答，確定交卷？`)) return;
          session.elapsed = fmtTime(Date.now() - session.started);
          session.submitted = true;
          clearInterval(timer);
          items.forEach((q) => { const L = session.answers[q.id]; store.record(q.id, L != null && isCorrect(q, L)); });
          refreshBadge();
          rerender();
          window.scrollTo(0, 0);
        },
      }, "交卷")))
  );
}

/* ---------- 錯題本與學習紀錄 ---------- */
function topicStrength() {
  // 以一級主題統計你的答對率（至少作答 3 次才列入）
  const st = store.stats();
  const agg = new Map();
  Object.entries(st).forEach(([id, s]) => {
    const q = byId.get(id);
    const code = q && l1Of(q.tp);
    if (!code) return;
    const a = agg.get(code) || { c: 0, w: 0 };
    a.c += s.c;
    a.w += s.w;
    agg.set(code, a);
  });
  return [...agg].map(([code, a]) => ({ code, name: L1.get(code).name, c: a.c, w: a.w, n: a.c + a.w, acc: a.c / (a.c + a.w) })).filter((x) => x.n >= 3);
}

function notebook() {
  const render = () => { app().replaceChildren(); notebook(); refreshBadge(); };
  const wrongItems = store.wrongIds().map((id) => byId.get(id)).filter(Boolean).sort((a, b) => a.sub.localeCompare(b.sub) || b.y - a.y || (b.ss || 0) - (a.ss || 0) || a.n - b.n);
  const st = store.stats();
  const totalC = Object.values(st).reduce((s, x) => s + x.c, 0);
  const totalW = Object.values(st).reduce((s, x) => s + x.w, 0);
  const total = totalC + totalW;
  const streak = store.streak();
  const days = store.lastDays(7);
  const strength = topicStrength().sort((a, b) => a.acc - b.acc);

  app().append(el("div", { class: "page-head" }, el("h1", {}, "錯題本與學習紀錄"), el("p", { class: "lead" }, "答錯的題目會自動收集在這裡；在這裡重練時，答對就會移出錯題本。紀錄只存在這個瀏覽器，換裝置或清除瀏覽器資料就會消失。")));

  if (!total && !wrongItems.length) {
    app().append(el("div", { class: "empty" }, el("div", { class: "em-ic" }, icon("target")), el("h3", {}, "還沒有學習紀錄"), el("p", {}, "完成幾題練習後，這裡會出現你的正確率、最近七天的作答量，以及需要加強的主題。"),
      el("a", { class: "btn", href: "#/practice" }, "開始第一次練習", icon("arrow"))));
    return;
  }

  const kpi = (ic, label, value, unit) => el("div", { class: "kpi" }, el("div", { class: "k-top" }, icon(ic), label), el("b", {}, value, unit ? el("small", {}, unit) : null));
  app().append(
    el("div", { class: "kpis" },
      kpi("target", "累計作答", fmtInt(total), "次"),
      kpi("award", "整體答對率", total ? `${Math.round((totalC / total) * 100)}` : "—", total ? "%" : ""),
      kpi("notebook", "錯題本", fmtInt(wrongItems.length), "題"),
      kpi("flame", "連續練習", String(streak), "天")),
    el("div", { class: "dash" },
      el("div", { class: "panel" }, el("h3", {}, icon("trend"), "最近七天作答量"), bars7(days),
        el("div", { class: "row small muted", style: "margin-top:6px;gap:16px" }, el("span", {}, el("span", { style: "color:var(--accent)" }, "■"), " 答對"), el("span", {}, el("span", { style: "color:var(--bad)" }, "■"), " 答錯"))),
      TAX ? el("div", { class: "panel" }, el("h3", {}, icon("target"), "主題強弱（答對率由低到高）"),
        strength.length
          ? el("div", {}, ...strength.slice(0, 6).map((x) => el("div", { class: "tbar" }, el("span", { class: "nm", title: x.name }, x.name), el("div", { class: "pbar" }, el("i", { class: x.acc < 0.6 ? "low" : "", style: `width:${Math.max(x.acc * 100, 4)}%` })), el("span", { class: "pct" }, `${Math.round(x.acc * 100)}%`))),
              el("div", { class: "actions" }, el("button", { class: "btn", type: "button", onclick: () => weakPractice(strength.slice(0, 3).map((x) => x.code)) }, icon("flame"), "加強最弱的主題")))
          : el("p", { class: "muted", style: "margin:0" }, "同一主題累積作答 3 次以上，就會在這裡顯示你的強弱。")) : null
    )
  );

  if (!wrongItems.length) {
    app().append(el("div", { class: "empty" }, el("div", { class: "em-ic" }, icon("check")), el("h3", {}, "錯題本是空的"), el("p", {}, "目前沒有待複習的錯題，繼續保持！"), el("a", { class: "btn", href: "#/practice" }, "再練習一輪")));
    return;
  }
  const weak = new Map();
  wrongItems.forEach((q) => q.tp && weak.set(q.tp, (weak.get(q.tp) || 0) + 1));
  const weakList = [...weak].sort((a, b) => b[1] - a[1]).slice(0, 6);
  add(app(),
    el("div", { class: "sec-head" }, el("div", {}, el("h2", {}, `待複習的錯題（${wrongItems.length}）`))),
    TAX && weakList.length ? el("div", { class: "panel", style: "margin-bottom:16px" },
      el("b", {}, "你最常答錯的主題"),
      el("div", { class: "chips", style: "margin-top:10px" }, ...weakList.map(([code, n]) => el("span", { class: "tag" }, `${topicName(code)}・${n} 題`)))) : null,
    el("div", { class: "actions", style: "margin:0 0 18px" },
      el("button", { class: "btn", type: "button", onclick: () => startQuiz({ mode: "notebook", nav: "notebook", title: "錯題本複習", items: shuffle(wrongItems) }) }, icon("refresh"), `複習全部 ${wrongItems.length} 題`),
      el("button", { class: "btn danger", type: "button", onclick: () => { if (confirm("清空整個錯題本？此動作無法復原。")) { store.clearWrong(); render(); } } }, icon("trash"), "清空")),
    el("ul", { class: "list" }, ...wrongItems.map((q) => el("li", {},
      el("div", {}, el("b", {}, qLabel(q)), el("span", { class: "snip" }, q.q)),
      el("button", { class: "link-btn", type: "button", onclick: () => { store.removeWrong(q.id); render(); } }, "移除"))))
  );
}

/** 針對弱項主題出一份練習：優先錯過的、沒做過的，最多 20 題。 */
function weakPractice(l1Codes) {
  const st = store.stats();
  const pool = mcq().filter((q) => !q.d && q.tp && l1Codes.includes(l1Of(q.tp)));
  const score = (q) => (st[q.id] ? (st[q.id].w ? 0 : 2) : 1) + Math.random() * 0.9;
  const items = pool.sort((a, b) => score(a) - score(b)).slice(0, 20);
  if (!items.length) return;
  startQuiz({ mode: "practice", nav: "notebook", title: "弱項加強", items: shuffle(items) });
}

/* ---------- 問答題瀏覽 ---------- */
const efilt = { cat: "all", sub: "all", y: "all" };
function essay() {
  const list = essays();
  const out = el("div");
  const catSel = el("select", { "aria-label": "類科" }, el("option", { value: "all" }, "全部類科"), ...CAT_ORDER.map((c) => el("option", { value: c }, catName(c))));
  const subSel = el("select", { "aria-label": "科目" }, el("option", { value: "all" }, "全部科目"), ...Object.entries(SUBS()).map(([k, s]) => el("option", { value: k }, s.name)));
  const ySel = el("select", { "aria-label": "年度" }, el("option", { value: "all" }, "全部年度"), ...years(list).map((y) => el("option", { value: y }, `${y} 年`)));
  catSel.value = efilt.cat;
  subSel.value = efilt.sub;
  ySel.value = efilt.y;
  const draw = () => {
    efilt.cat = catSel.value;
    efilt.sub = subSel.value;
    efilt.y = ySel.value;
    const cats = new Set(efilt.cat === "all" ? CAT_ORDER : [efilt.cat]);
    const rows = list.filter((q) => cats.has(q.cl) && !hiddenDup(q, cats) && (efilt.sub === "all" || q.sub === efilt.sub) && (efilt.y === "all" || q.y === Number(efilt.y)));
    out.replaceChildren(el("p", { class: "muted" }, `${rows.length} 題`));
    let lastKey = null;
    rows.forEach((q) => {
      const key = `${q.cl}-${q.sub}-${q.y}-${q.ss || 0}-${q.grp || q.n}`;
      const c = el("article", { class: "qcard sm" }, tagRow(q));
      if (q.ctx && key !== lastKey) add(c, el("div", { class: "ctx" }, el("div", { class: "ctx-label" }, icon("book"), "題組情境"), el("p", {}, q.ctx), figImgs(q.gcr, "題組共用的圖表")));
      lastKey = key;
      c.append(el("p", { class: "stem" }, q.q));
      add(c, figImgs(q.cr, "本題原卷截圖"));
      if (q.o) c.append(el("div", { class: "opts" }, ...q.o.map((t, i) => el("div", { class: "opt", style: "cursor:default" }, el("span", { class: "letter" }, "ABCDE"[i]), el("span", { class: "otext" }, t)))));
      const note = [q.sp ? `分項配分：${q.sp}` : null, q.fmt ? `作答格式：${q.fmt}` : null, "官方不提供參考答案，需人工評閱。"].filter(Boolean).join("　");
      add(c, el("p", { class: "small muted", style: "margin:12px 0 0" }, note), topicLine(q), bookBlock(q, false), reportTools(q));
      out.append(c);
    });
  };
  catSel.addEventListener("change", draw);
  subSel.addEventListener("change", draw);
  ySel.addEventListener("change", draw);
  app().append(
    el("div", { class: "page-head" }, el("h1", {}, "問答題與綜合題"), el("p", { class: "lead" }, "這些題目需人工評閱，官方沒有公布參考答案，這裡僅供瀏覽、拿來自己練習寫作。")),
    el("div", { class: "row", style: "margin-bottom:18px" }, catSel, subSel, ySel),
    out
  );
  draw();
}

/* ---------- 命題趨勢 ---------- */
const tfilt = { cat: "all", scope: "all", mode: "count" };

function trend() {
  if (!TAX) return void (location.hash = "#/");
  const ys = years(Q).sort((a, b) => a - b);
  const out = el("div", { class: "tablewrap" });
  const top = el("div", { class: "panel", style: "margin-bottom:22px" });
  const scopeSel = el("select", { "aria-label": "題型" }, el("option", { value: "all" }, "全部題型"), el("option", { value: "m" }, "只看選擇題"));
  const modeSel = el("select", { "aria-label": "顯示方式" }, el("option", { value: "count" }, "題數"), el("option", { value: "pct" }, "占該年比例（%）"));
  const catSel = el("select", { "aria-label": "類科" }, el("option", { value: "all" }, "全部類科（共用題只算一次）"), ...CAT_ORDER.map((c) => el("option", { value: c }, catName(c))));
  catSel.value = tfilt.cat;
  scopeSel.value = tfilt.scope;
  modeSel.value = tfilt.mode;

  const draw = () => {
    tfilt.cat = catSel.value;
    tfilt.scope = scopeSel.value;
    tfilt.mode = modeSel.value;
    const pool = Q.filter((q) => q.tp && (tfilt.scope === "all" || q.t === "m") && (tfilt.cat === "all" ? !q.d : q.cl === tfilt.cat));
    const cnt = new Map();
    const yTotal = new Map();
    const key = (c, y) => `${c}|${y}`;
    pool.forEach((q) => {
      cnt.set(key(q.tp, q.y), (cnt.get(key(q.tp, q.y)) || 0) + 1);
      yTotal.set(q.y, (yTotal.get(q.y) || 0) + 1);
    });
    const val = (n, y) => (tfilt.mode === "pct" ? (n / yTotal.get(y)) * 100 : n);
    const fmt = (v) => (tfilt.mode === "pct" ? v.toFixed(0) : String(v));
    const max = tfilt.mode === "pct" ? 25 : 8;
    const cell = (n, y) => {
      if (!n) return el("td", { class: "num" });
      const v = val(n, y);
      return el("td", { class: "num", style: `background:color-mix(in srgb, var(--accent) ${Math.min(v / max, 1) * 58}%, transparent)` }, fmt(v));
    };
    const total = (code) => ys.reduce((s, y) => s + (cnt.get(key(code, y)) || 0), 0);
    const grand = pool.length;

    // 近年最常考的主題（最近 6 個有試題的年度）
    const recent = ys.filter((y) => y !== 107).slice(-6);
    const recentTotal = recent.reduce((s, y) => s + (yTotal.get(y) || 0), 0);
    const ranked = [...L2.keys()].map((code) => ({ code, n: recent.reduce((s, y) => s + (cnt.get(key(code, y)) || 0), 0), series: ys.map((y) => cnt.get(key(code, y)) || 0) }))
      .filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 5);
    top.replaceChildren(
      el("div", { class: "sec-head", style: "margin:0 0 8px" }, el("div", {}, el("h3", { style: "margin:0;font-size:18px" }, `近年最常考的 5 個主題（${recent[0]}–${recent[recent.length - 1]} 年）`), el("p", { class: "small", style: "margin:2px 0 0" }, "占比以所選範圍的近年題數計算（選「全部類科」時含國語文與數學共同科目）；中間走勢圖為各年出現次數。"))),
      el("div", { class: "toptopics" }, ...ranked.map((x, i) => {
        const t = L2.get(x.code);
        return el("div", { class: "tt" }, el("span", { class: "rk" }, i + 1), el("div", { class: "nm" }, t.name, el("small", {}, L1.get(t.l1).name)), el("div", { class: "spark" }, sparkline(x.series)), el("span", { class: "sh" }, `${recentTotal ? ((x.n / recentTotal) * 100).toFixed(1) : 0}%`));
      }))
    );

    const head = el("tr", {}, el("th", { class: "stick" }, "主題"), ...ys.map((y) => el("th", { class: "num" }, String(y).padStart(3, "0").slice(-3))), el("th", { class: "num" }, "合計"), el("th", { class: "num" }, "占比"));
    const body = [];
    const groups = [...TAX.l1];
    if ([...cnt.keys()].some((k) => k.startsWith("OT|"))) groups.push({ code: "OT", name: "其他", l2: [{ code: "OT", name: "其他／無法歸類" }] });
    groups.forEach((a) => {
      const t1 = a.l2.reduce((s, b) => s + total(b.code), 0);
      body.push(el("tr", { class: "l1" }, el("th", { class: "stick" }, a.name),
        ...ys.map((y) => { const n = a.l2.reduce((s, b) => s + (cnt.get(key(b.code, y)) || 0), 0); return cell(n, y); }),
        el("td", { class: "num" }, String(t1)), el("td", { class: "num" }, `${((t1 / grand) * 100).toFixed(1)}%`)));
      a.l2.forEach((b) => {
        const t2 = total(b.code);
        body.push(el("tr", {}, el("th", { class: "stick sub", title: b.desc || "" }, b.name),
          ...ys.map((y) => cell(cnt.get(key(b.code, y)) || 0, y)),
          el("td", { class: "num" }, String(t2)), el("td", { class: "num" }, `${((t2 / grand) * 100).toFixed(1)}%`)));
      });
    });
    out.replaceChildren(el("table", { class: "trend" }, el("thead", {}, head), el("tbody", {}, body)));
  };
  catSel.addEventListener("change", draw);
  scopeSel.addEventListener("change", draw);
  modeSel.addEventListener("change", draw);
  app().append(
    el("div", { class: "page-head" }, el("h1", {}, "命題趨勢"), el("p", { class: "lead" }, "各主題在歷年試題出現的次數。顏色越深表示越多。一級分類為粗體列，滑鼠停在二級分類上可看涵蓋範圍。")),
    el("div", { class: "row", style: "margin-bottom:18px" }, catSel, scopeSel, modeSel),
    top, out,
    el("div", { class: "notice" }, icon("info"), el("div", {}, el("b", {}, "解讀時請留意："), "各年度的題目範圍與題數不同，早期（94–109 年）各科的內容分布和 110 年之後的新制三科不同，主題比例的年度變化要連同科目一起看；107 年只有範例題；108 年有兩次考試，兩次的題目合併計算，題數約為其他年度的兩倍。選「全部類科」時共用題只算一次；幼教、特教專屬主題只出現在有這些類科的卷子裡；國語文與數學能力測驗是共同科目，有各自的主題。分類為 AI 依題意標註，僅供參考。"))
  );
  draw();
}

/* ---------- 說明 ---------- */
function about() {
  app().append(
    el("div", { class: "page-head" }, el("h1", {}, "說明"), el("p", { class: "lead" }, TAX ? "資料來源、使用須知，以及主題分類與學習紀錄的運作方式。" : "資料來源、使用須知，以及學習紀錄的運作方式。")),
    el("div", { class: "prose" },
      el("h2", { style: "margin-top:0" }, "資料來源"),
      el("p", {}, "試題與參考答案取自教育部「高級中等以下學校及幼兒園教師資格考試」官方網站的「歷屆試題」與「試題疑義」頁面，", el("a", { href: OFFICIAL_URL, target: "_blank", rel: "noopener" }, "官方連結"), "。本站與主辦單位無關。版權、第三方內容與隱私的說明，請見", el("a", { href: "#/legal" }, "版權與資料來源"), "。"),
      el("h2", {}, "使用前請注意"),
      el("ul", {},
        el("li", {}, "題目文字由 PDF 轉錄而成，可能有錯字或排版差異。每題都附「看原卷」，可以對照原始頁面，圖表題也請以原卷為準。"),
        el("li", {}, "94–97、100 年的試卷是掃描檔，文字由 OCR 轉錄後，已逐頁對照原卷頁面圖校對（修正錯字、補回漏掉的題目與選項），答案表也已與原件核對；仍可能有少數錯字，每題都可點「看原卷」對照。"),
        TAX ? el("li", {}, "標示「曾有疑義」的題目，官方審議後維持原答案，或依公告送分、兩選項皆給分；系統已依公告計分。") : null,
        el("li", {}, "舊制（94–109 年）題目可能引用已修正的法規或舊課綱，作答前請留意時效。"),
        el("li", {}, "目前收錄：五個類科（中等學校、國民小學、幼兒園、特教身障組、特教資優組）的新制教育專業三科（110–115 年）與舊制各科（94–109 年，含 94–97、100 年掃描試卷與 107 年範例題），以及各類科共同的國語文能力測驗（94–115 年）與國小數學能力測驗（103–115 年）。"),
        el("li", {}, "標示「待校對」的題目，是 PDF 文字層缺少題號、依結構切分而成，請對照原卷。數學題的公式、分數與圖形由 PDF 擷取，文字可能不完整，每題都附原卷截圖，請以截圖為準。"),
        el("li", {}, "各類科的試卷有些題目完全相同（共同題），練習與統計時只計一次；模擬考則依各類科完整試卷作答。")
      ),
      TAX ? el("h2", {}, "主題分類怎麼來的") : null,
      TAX ? el("p", {}, "教育專業科目的前 14 個一級分類依據教育部《教師資格考試命題作業要點》第 4 條對各科命題範圍的描述（官方沒有公布更細的大綱或各主題比重）；幼兒園（幼教）、特殊教育（特教）專屬的一級分類，以及國語文、數學能力測驗的分類，是依這些科目的歷屆題目內容歸納，並非官方分類。二級分類與標籤則由 AI 逐題閱讀題目後標註，再由另一個獨立的標註者複核，信心較低或兩者不一致的題目會標示出來，結果僅供篩題與趨勢參考。") : null,
      el("h2", {}, "你的紀錄"),
      el("p", {}, "錯題本與作答統計只儲存在你這台裝置的瀏覽器中，不會傳到任何伺服器；清除瀏覽器資料或換裝置就會消失。"),
      el("h2", {}, "發現錯誤？"),
      el("p", {}, "每題下方都有「回報此題有誤」，也可以直接前往", el("a", { href: "#/report" }, "回報頁面"), "。")
    )
  );
}

/* ---------- 回報問題 ---------- */
const REPORT_TYPES = [
  ["answer", "答案可能有誤"],
  ["text", "題目或選項文字有誤"],
  ["figure", "圖表或數學公式缺漏、看不清楚"],
  ["topic", "主題分類不太對"],
  ["explain", "詳解有誤或不清楚"],
  ["legal", "版權或下架通知"],
  ["other", "其他"],
];
const REPORT_ERRORS = {
  invalid: "請選擇問題類型，並至少寫幾個字說明。",
  invalid_contact: "聯絡信箱的格式不太對，請檢查，或留空。",
  rate_limited: "送出太頻繁了，請過幾分鐘再試。",
  not_configured: "回報功能暫時無法使用，請稍後再試。",
};

function report() {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const id = params.get("id") || "";
  const q = byId.get(id);
  const openedAt = Date.now();
  const typeSel = el("fieldset", {}, el("legend", {}, "問題類型"), el("div", { class: "chips" },
    ...REPORT_TYPES.filter(([v]) => TAX || (v !== "topic" && v !== "explain")).map(([v, t]) => el("label", { class: "chip" }, el("input", { type: "radio", name: "type", value: v, checked: params.get("type") === v || null }), el("span", {}, t)))));
  const idInput = el("input", { type: "text", name: "id", value: id, maxlength: "40", placeholder: "例如 110-ED-M01（可留空）", autocomplete: "off" });
  const msg = el("textarea", { name: "message", rows: "6", maxlength: "1500", required: true, placeholder: "請簡單描述問題。若認為答案有誤，請寫出你認為正確的答案與依據；若是版權或下架通知，請寫明需要處理的內容與你的身分。" });
  const count = el("span", { class: "small muted" }, "0 / 1500");
  msg.addEventListener("input", () => { count.textContent = `${msg.value.length} / 1500`; });
  const contact = el("input", { type: "email", name: "contact", maxlength: "120", placeholder: "選填：希望收到回覆才需要填", autocomplete: "email" });
  const trap = el("div", { class: "hp", "aria-hidden": "true" }, el("label", {}, "網站", el("input", { type: "text", name: "website", tabindex: "-1", autocomplete: "off" })));
  const status = el("p", { class: "form-status", role: "status" });
  const submit = el("button", { class: "btn", type: "submit" }, icon("flag"), "送出回報");
  const form = el("form", { class: "report-form", novalidate: true },
    typeSel,
    el("label", { class: "field" }, "題號", idInput),
    el("label", { class: "field" }, "說明", msg, count),
    el("label", { class: "field" }, "聯絡信箱（選填）", contact),
    trap,
    el("p", { class: "small muted" }, "請不要填寫個人資料。內容會寄到站長信箱，僅用於核對與更正題庫，詳見「版權與資料來源」。"),
    el("div", { class: "row" }, submit, status));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const type = new FormData(form).get("type");
    if (!type || msg.value.trim().length < 5) { status.textContent = REPORT_ERRORS.invalid; status.className = "form-status bad"; return; }
    submit.disabled = true;
    status.textContent = "送出中…";
    status.className = "form-status";
    try {
      const qid = idInput.value.trim();
      const res = await fetch(REPORT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id: qid, label: byId.get(qid) ? qLabel(byId.get(qid)) : "", message: msg.value, contact: contact.value, website: form.elements.website.value, fillMs: Date.now() - openedAt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw Object.assign(new Error(data.error || String(res.status)), { code: data.error });
      form.replaceWith(el("div", { class: "notice ok" }, icon("check"), el("div", {}, el("b", {}, "已收到你的回報，謝謝！"), el("p", { style: "margin:6px 0 0" }, "我們會對照原卷核對，若屬實會在下次更新時修正。版權或下架通知會優先處理。"), el("p", { style: "margin:10px 0 0" }, el("a", { class: "link-btn", href: "#/" }, "回首頁")))));
    } catch (err) {
      status.textContent = REPORT_ERRORS[err.code] || "送出失敗，請稍後再試。若一直失敗，可能是網路或服務暫時有問題。";
      status.className = "form-status bad";
      submit.disabled = false;
    }
  });
  const preview = q ? el("article", { class: "qcard sm" },
    el("div", { class: "ctx-label" }, icon("flag"), "你要回報的題目"), tagRow(q), el("p", { class: "stem" }, q.q), figImgs(q.cr, "本題原卷截圖"),
    q.o ? el("div", { class: "opts" }, ...q.o.map((t, i) => el("div", { class: "opt", style: "cursor:default" }, el("span", { class: "letter" }, "ABCDE"[i]), el("span", { class: "otext" }, t)))) : null,
    q.a ? el("p", { class: "small muted", style: "margin:12px 0 0" }, `官方答案：${ansLabel(q)}`) : null,
    pageViewer(q)) : (id ? el("div", { class: "notice" }, icon("info"), el("div", {}, `找不到題號「${id}」，請確認題號是否正確，或直接在下方填寫。`)) : null);
  app().append(
    el("div", { class: "page-head" }, el("h1", {}, "回報問題"), el("p", { class: "lead" }, "發現答案、文字、圖表有誤，或想通知版權相關事項，都可以在這裡告訴我們。")),
    preview,
    el("div", { class: "panel", style: "margin-top:18px" }, form)
  );
}

/* ---------- 版權與資料來源 ---------- */
function legal() {
  const official = el("a", { href: OFFICIAL_URL, target: "_blank", rel: "noopener" }, "官方歷屆試題頁");
  // 聯絡方式：回報頁（內容會寄到站長信箱，信箱不公開）；若另外設定了公開信箱也一併列出
  const contact = [
    el("a", { href: "#/report?type=legal" }, "回報頁面"),
    "，版權或下架通知請選「版權或下架通知」類型（其他問題選對應類型），並寫明需要處理的題號或頁面網址。",
    CONTACT_EMAIL ? ["也可以來信：", el("a", { href: `mailto:${CONTACT_EMAIL}` }, CONTACT_EMAIL), "。"] : null,
  ];
  app().append(
    el("div", { class: "page-head" }, el("h1", {}, "版權與資料來源"), el("p", { class: "lead" }, "本站的題目從哪裡來、哪些內容的權利屬於誰，以及如何聯絡我們。")),
    el("div", { class: "prose" },
      el("h2", { style: "margin-top:0" }, "本站是什麼"),
      el("p", {}, "「Sci-Flipper 教師資格考試練習平台」是由翻轉•跨領域•專業學習社群 Sci-Flipper 提供的免費學習工具，不收費、不投放廣告，與教育部及教師資格考試的主辦單位沒有任何隸屬或合作關係，也不使用任何官方標誌。正式的考試資訊、簡章與試題原檔，請以", official, "為準。"),
      el("h2", {}, "試題與答案的來源"),
      el("ul", {},
        el("li", {}, "試題、參考答案與試題疑義回覆，均取自教育部「高級中等以下學校及幼兒園教師資格考試」官方網站公開提供的檔案，本站只做轉錄、分類與練習功能，並在每題附上原卷頁碼，方便對照。"),
        el("li", {}, "依著作權法第 9 條第 1 項第 5 款，「依法令舉行之各類考試試題及其備用試題」不得為著作權之標的。"),
        el("li", {}, "參考答案與疑義回覆的說明文字，由主辦單位公布；本站為個人學習目的而引用，並註明出處，本站不主張這些內容的任何權利。"),
        el("li", {}, "原卷頁面圖與題目截圖，是為了讓你對照原件、避免轉錄錯誤而附上，內容與官方檔案相同。")
      ),
      el("h2", {}, "試題中引用的第三方文章"),
      el("p", {}, "國語文能力測驗的閱讀文章、部分題目中的圖片與引文，原本就是試題的一部分，本站依原卷呈現。這些文章與圖片的著作權仍屬原作者或出版者；若你是權利人，認為不宜在本站呈現，請依下方方式聯絡，我們會儘速處理。"),
      el("h2", {}, "本站整理的內容"),
      el("p", {}, TAX ? "主題分類、題目標註、命題趨勢統計與網站介面，是本站整理的內容。主題標註由人工智慧協助完成，並非官方分類，也尚未經專家驗證，僅供篩題與趨勢參考。個人學習與教學、研究用途可以自由使用，請註明出處「Sci-Flipper 教師資格考試練習平台」；若要商業使用，請先聯絡。" : "本站整理的內容（轉錄校對、排版、說明文字）可供個人學習與教學使用，請註明出處「Sci-Flipper 教師資格考試練習平台」；大量重製或商業使用，請先透過本站「回報」頁面聯絡。"),
      el("h2", {}, "正確性聲明"),
      el("ul", {},
        el("li", {}, "題目文字由 PDF 轉錄而成（94–97、100 年為掃描檔，以 OCR 轉錄後逐頁校對），仍可能有錯字、漏字或排版差異。"),
        el("li", {}, "數學題的公式、圖形與有圖表的題目，請以每題附的原卷截圖為準。"),
        el("li", {}, "答案以官方公布為準；本站曾發現個別答案表與題意不符的情形（例如 102 年幼兒園「教育原理與制度」第 38–40 題），已在該題附註說明。"),
        el("li", {}, "本站不保證內容完全正確、完整或適用於任何特定目的，也不保證使用本站能通過考試。舊制題目可能引用已修正的法規或舊課綱，作答前請留意時效。")
      ),
      el("h2", {}, "隱私"),
      el("ul", {},
        el("li", {}, "本站不要求登入，不蒐集姓名、信箱等個人資料，目前也沒有使用追蹤用的 Cookie 或第三方分析工具。"),
        el("li", {}, "你的作答紀錄、錯題本與外觀設定，只儲存在你這台裝置的瀏覽器（localStorage），不會傳到任何伺服器；清除瀏覽器資料或換裝置就會消失。"),
        el("li", {}, "網站由第三方主機服務代管，主機服務可能留存一般的伺服器存取紀錄（例如 IP 位址與時間），本站無法取用這些紀錄。"),
        el("li", {}, "若你使用「回報問題」功能，你填寫的題號、說明與（選填的）聯絡信箱，會透過本站的主機服務（Cloudflare）與寄信服務（Resend）傳送到站長信箱，僅用於核對與更正題庫，不會公開。請不要在說明中填寫個人資料。")
      ),
      el("h2", {}, "聯絡、更正與下架"),
      el("p", {}, "發現題目或答案有誤、權利人要求更正或下架，請使用", ...contact.flat(), "收到後會儘速核對處理。"),
      el("p", { class: "small muted" }, "本頁最後更新：2026 年 11 月 3 日。內容若有修改，會更新此日期。")
    )
  );
}

/* ---------- 登入與同步 ---------- */
const isDark = () => document.documentElement.getAttribute("data-theme") === "dark";

function loginHint() {
  return el("p", { class: "small muted" }, "登入後可看 AI 詳解與主題分類。", " ", el("a", { href: "#/account" }, "前往登入"));
}

function refreshNav() {
  $("#nav-trend").hidden = !TAX;
  $("#nav-account").hidden = true; // 離線版：無登入
  $("#nav-account span").textContent = signedIn() ? "帳號" : "登入";
}

const syncText = (t) => (t ? `已同步（${new Date(t).toLocaleString("zh-TW", { hour12: false })}）` : "尚未同步。登入後會自動同步。");

async function afterLogin() {
  await loadPremium();
  await pull();
  refreshNav();
  if ((location.hash.replace(/^#\/?/, "") || "").split("?")[0] === "account") route();
}

async function deleteAccount() {
  if (!confirm("確定要刪除站內帳號與雲端學習紀錄嗎？\n本機瀏覽器裡的紀錄會保留。此動作無法復原。")) return;
  const r = await api("account", { method: "DELETE" });
  if (!r?.ok) return void alert("刪除失敗，請稍後再試。");
  signOut();
  location.reload();
}

function account() {
  const on = signedIn();
  const sec = [el("div", { class: "page-head" }, el("h1", {}, "登入與同步"), el("p", { class: "lead" }, "登入後可看 AI 詳解與主題分類，並讓學習紀錄跨裝置同步。"))];
  if (LITE) {
    sec.push(el("div", { class: "notice" }, icon("info"), el("div", {}, "這是精簡版（只有題目與官方答案），沒有登入功能。")));
  } else if (!on && !loginAvailable()) {
    sec.push(el("div", { class: "notice" }, icon("info"), el("div", {}, "登入功能目前尚未開放。")));
  } else if (!on) {
    const holder = el("div", { class: "gbtn" });
    const msg = el("p", { class: "small", role: "status" });
    sec.push(el("div", { class: "panel" },
      el("h3", {}, icon("user"), "使用 Google 帳號登入"),
      el("p", {}, "登入後可以："),
      el("ul", {}, el("li", {}, "查看每題的 AI 詳解（草稿，請以官方答案為準）"), el("li", {}, "使用主題篩題與命題趨勢"), el("li", {}, "錯題本與學習紀錄在不同裝置之間同步")),
      holder, msg));
    mountGoogleButton(holder, { dark: isDark(), onDone: afterLogin, onError: () => { msg.textContent = "登入失敗，請稍後再試。"; } })
      .catch(() => { msg.textContent = "無法載入 Google 登入。請確認網路連線，並允許彈出視窗後再試。"; });
  } else {
    const line = el("p", { class: "small muted" }, syncStatus().last ? syncText(syncStatus().last) : "學習紀錄有變動時會自動同步到雲端。");
    sec.push(el("div", { class: "panel" },
      el("h3", {}, icon("check"), "已登入"),
      line,
      el("div", { class: "row-btns" },
        el("button", { class: "btn", type: "button", onclick: async () => { line.textContent = "同步中…"; const ok = await pull(); line.textContent = ok ? syncText(syncStatus().last) : "同步失敗，請稍後再試。"; } }, icon("refresh"), "立即同步"),
        el("button", { class: "btn ghost", type: "button", onclick: () => { signOut(); location.reload(); } }, "登出（本機紀錄保留）"))));
    sec.push(el("div", { class: "panel" },
      el("h3", {}, icon("trash"), "刪除帳號"),
      el("p", {}, "會刪除站內帳號與雲端上的學習紀錄（錯題本、作答次數）。本機瀏覽器裡的紀錄不會被刪除。Google 帳號本身不受影響。"),
      el("button", { class: "btn ghost", type: "button", onclick: deleteAccount }, "刪除帳號與雲端紀錄")));
  }
  sec.push(el("div", { class: "panel" },
    el("h3", {}, "隱私說明"),
    el("ul", {},
      el("li", {}, "只保存 Google 帳號的隨機識別碼，不保存信箱、姓名或頭像。"),
      el("li", {}, "雲端保存的只有學習紀錄：錯題編號、作答次數與每日作答量。"),
      el("li", {}, "加值內容（詳解、主題）每人每天有查詢次數上限（300 次），用來減少大量下載。"),
      el("li", {}, "不登入也能使用題庫、作答與本機的學習紀錄。"))));
  app().append(...sec);
}

/* ---------- 外觀（淺色／深色） ---------- */
function setupTheme() {
  const btn = $("#theme-btn");
  const draw = () => {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    btn.replaceChildren(icon(dark ? "sun" : "moon"));
    btn.title = dark ? "切換為淺色外觀" : "切換為深色外觀";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0a1120" : "#2552c7");
  };
  btn.addEventListener("click", () => {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    if (dark) document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", "dark");
    try { localStorage.setItem("tqa-theme", dark ? "light" : "dark"); } catch { /* 忽略 */ }
    draw();
  });
  draw();
}

/* ---------- 啟動 ---------- */
(async function init() {
  if (shouldGate()) return void showGate();
  document.querySelectorAll("#nav a[data-i]").forEach((a) => a.prepend(icon(a.dataset.i)));
  mountSfBar();
  setupTheme();
  try {
    await loadData();
    refreshNav();
    onSessionChange(() => refreshNav());
    if (signedIn()) pull().then(() => refreshBadge());
  } catch (e) {
    app().replaceChildren(el("div", { class: "notice" }, icon("info"), el("div", {}, "題庫載入失敗，請重新整理頁面。若是在本機開啟，請改用 http 伺服器（例如 python3 -m http.server）。")));
    console.error(e);
    return;
  }
  $("#built").textContent = `題庫更新：${META.built}`;
  window.addEventListener("hashchange", route);
  route();
})();

__M["app"] = {  };
})();
