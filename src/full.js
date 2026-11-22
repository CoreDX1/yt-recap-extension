// src/full.js — v3.0 (Spotify 2026)
import {
  translateCategory,
  toDateKey,
  resolveVideoUrl,
  openInstantPlaylist,
  formatClock,
  formatDuration,
  matchesFilter,
  matchesPeriodAndSourceOnly,
  aggregateTracks,
  getGroupKey,
  isMusicItem,
  buildIndex,
} from "./utils.js";
import {
  buildTrackRow,
  renderInteractionRow,
  renderSearchRow,
} from "./rows.js";
import { CALENDAR_MARKUP, CALENDAR_DOM_IDS } from "./calendarMarkup.js";
import { bindCalendarControls } from "./calendarController.js";
import {
  loadStore,
  migrateMusicFlags,
  persistMusicFlags,
  downloadBlob,
  exportPngCard,
  buildExportZip,
  enrichImported,
  NowPlaying,
  emptyStore,
  persistStore,
  clearAllData,
} from "./recapStore.js";
import {
  summaryVM,
  activityVM,
  homeVM,
  searchVM,
  exploreInsightsVM,
  formatsVM,
  calendarHeroVM,
  artistDirectoryVM,
  artistDetailVM,
  channelDirectoryVM,
  channelDetailVM,
  likesPageVM,
  kpiMicroVM,
  prevHoursVM,
  yearHeatVM,
  insightsVM,
} from "./viewModels.js";
import { renderCalendarView } from "./calendarView.js";
import { icon, mountIcons } from "./icons.js";
import { relativeTime, formatTimeEs, greeting } from "./relativeTime.js";
import { createMonogram, attachImgFallback } from "./monogram.js";

const $ = (id) => document.getElementById(id);
const urlParams = new URLSearchParams(location.search);

const PERIODS = [
  ["7", "7 días"],
  ["30", "30 días"],
  ["90", "3 meses"],
  ["365", "Este año"],
  ["all", "Todo"],
];

const state = {
  scope:
    localStorage.getItem("recapFullScope") === "youtube" ? "youtube" : "music",
  route: "home",
  detail: null,
  perScopeRoute: {
    music: localStorage.getItem("recapRouteMusic") || "home",
    youtube: localStorage.getItem("recapRouteYoutube") || "home",
  },
  period: localStorage.getItem("recapFullPeriod") || "30",
  q: "",
  pinnedNpTabId: null,
  currentTabId: null,
  currentNp: null,
  seeking: false,
  hourFilter: null,
  searchIndex: -1,
  lastRoute: null,
  lastScope: null,
  lastDetail: null,
  sigs: null,
  peopleSort: localStorage.getItem("recapPeopleSort") || "time",
  peopleMinSec: Number(localStorage.getItem("recapPeopleMin") || 0),
  peopleQuery: "",
  likesTab: localStorage.getItem("recapLikesTab") || "likes",
  hoursMode: localStorage.getItem("recapHoursMode") || "bars",
  showGhost: localStorage.getItem("recapGhost") !== "0",
  animateNext: true,
  libQuery: "",
  npOpen: false,
};

const store = emptyStore();
const npService = new NowPlaying();
const observers = new Set();
const shelfScroll = new Map();
const pendingShelves = [];
const mountedRows = new Map();
let memoSigKey = null;
const memo = new Map();
let ANIM = false;
const countUps = new Set();

let dataIndex = null;
let dataIndexKey = null;
let dataViewCache = null;
let dataViewKey = null;
let dirTimer = null;
let lastPlayerSig = "";
let lastQueueSig = "";

function getDataIndex() {
  const k = `${store.history.length}|${store.interactions.length}|${store.searches.length}|${store.channelVisits.length}|${store.skips.length}`;
  if (!dataIndex || dataIndexKey !== k) {
    dataIndex = buildIndex(store);
    dataIndexKey = k;
    dataViewCache = null;
  }
  return dataIndex;
}

function dataView() {
  const idx = getDataIndex();
  const scope = scopeValue();
  const key = `${scope}|${state.period}`;
  if (dataViewCache && dataViewKey === key) return dataViewCache;
  const cutoff =
    state.period === "all" ? 0 : Date.now() - Number(state.period) * 86400000;
  const plays = [],
    inter = [],
    searches = [],
    visits = [],
    skips = [];
  for (const [dk, b] of idx.byDay) {
    if (cutoff && Date.parse(`${dk}T23:59:59`) < cutoff) continue;
    for (const p of b.plays)
      if (matchesFilter(p, state.period, scope, true)) plays.push(p);
    for (const sk of b.skips)
      if (matchesFilter(sk, state.period, scope, true)) skips.push(sk);
    for (const it of b.inter)
      if (matchesPeriodAndSourceOnly(it, state.period, scope, true))
        inter.push(it);
    for (const s of b.searches)
      if (matchesPeriodAndSourceOnly(s, state.period, scope, true))
        searches.push(s);
    for (const v of b.visits)
      if (matchesPeriodAndSourceOnly(v, state.period, scope, true))
        visits.push(v);
  }
  const allPlays = [],
    allInter = [],
    allSearches = [],
    allVisits = [];
  for (const [, b] of idx.byDay) {
    for (const p of b.plays)
      if (matchesFilter(p, "all", scope, false)) allPlays.push(p);
    for (const it of b.inter)
      if (matchesPeriodAndSourceOnly(it, "all", scope, false))
        allInter.push(it);
    for (const s of b.searches)
      if (matchesPeriodAndSourceOnly(s, "all", scope, false))
        allSearches.push(s);
    for (const v of b.visits)
      if (matchesPeriodAndSourceOnly(v, "all", scope, false)) allVisits.push(v);
  }
  dataViewCache = {
    plays,
    inter,
    searches,
    visits,
    skips,
    allPlays,
    allInter,
    allSearches,
    allVisits,
  };
  dataViewKey = key;
  return dataViewCache;
}

const calUi = {
  calViewMode: "month",
  calSearchQuery: "",
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  selectedDateKey: toDateKey(new Date()),
  calDayMode: "all",
  calScale:
    localStorage.getItem("recapCalScale") === "absolute"
      ? "absolute"
      : "relative",
  calLevelFilter: null,
  calRangeAnchor: null,
  calRangeEnd: null,
  calWeekOpen: null,
  calYrZoom: Number(localStorage.getItem("recapCalYrZoom") || 12) || 12,
  monthTopVideoIds: [],
  monthCardData: null,
};

let domCal = null;

const els = {
  mainCol: $("mainCol"),
  topbar: $("topbar"),
  navBack: $("navBack"),
  navFwd: $("navFwd"),
  homeBtn: $("homeBtn"),
  brandBtn: $("brandBtn"),
  brandLogo: $("brandLogo"),
  brandWord: $("brandWord"),
  sideNav: $("sideNav"),
  peopleLabel: $("peopleLabel"),
  libraryLabel: $("libraryLabel"),
  newPlaylistBtn: $("newPlaylistBtn"),
  libSearch: $("libSearch"),
  sideLists: $("sideLists"),
  globalSearch: $("globalSearch"),
  searchDrop: $("searchDrop"),
  importBtn: $("importBtn"),
  importInput: $("importInput"),
  exportBtn: $("exportBtn"),
  helpBtn: $("helpBtn"),
  helpPop: $("helpPop"),
  miniToggleBtn: $("miniToggleBtn"),
  periodChips: $("periodChips"),
  inlineStats: $("inlineStats"),
  content: $("content"),
  routes: {
    home: $("route-home"),
    explore: $("route-explore"),
    calendar: $("route-calendar"),
    people: $("route-people"),
    likes: $("route-likes"),
    results: $("route-results"),
  },
  calHero: $("calHero"),
  calHost: $("calHost"),
  pbSeek: $("pbSeek"),
  pbPrev: $("pbPrev"),
  pbPlay: $("pbPlay"),
  pbNext: $("pbNext"),
  pbTime: $("pbTime"),
  pbTimeTotal: $("pbTimeTotal"),
  pbThumb: $("pbThumb"),
  pbTitle: $("pbTitle"),
  pbArtist: $("pbArtist"),
  pbSource: $("pbSource"),
  pbLoopBadge: $("pbLoopBadge"),
  pbPinned: $("pbPinned"),
  pbStale: $("pbStale"),
  pbLike: $("pbLike"),
  pbMute: $("pbMute"),
  pbVol: $("pbVol"),
  pbLoop: $("pbLoop"),
  pbShuffle: $("pbShuffle"),
  pbQueue: $("pbQueue"),
  pbJump: $("pbJump"),
  npPanel: $("npPanel"),
  npClose: $("npClose"),
  npArt: $("npArt"),
  npPlay: $("npPlay"),
  npTitle: $("npTitle"),
  npArtist: $("npArtist"),
  npLike: $("npLike"),
  npSource: $("npSource"),
  npLoopBadge: $("npLoopBadge"),
  npPinned: $("npPinned"),
  npStale: $("npStale"),
  npMeta: $("npMeta"),
  npCount: $("npCount"),
  npJump: $("npJump"),
  queuePop: $("queuePop"),
  chartTip: $("chartTip"),
  toast: $("toast"),
  toastIcon: $("toastIcon"),
  toastMsg: $("toastMsg"),
  enrichMusicBtn: $("enrichMusicBtn"),
  clearBtn: $("clearBtn"),
  confirmClearDialog: $("confirmClearDialog"),
  cancelClearBtn: $("cancelClearBtn"),
  confirmClearBtn: $("confirmClearBtn"),
};

// ---------- helpers ----------
const toastQueue = [];
let toastBusy = false,
  toastTimer = null,
  toastGapTimer = null;
function toast(msg, isError = false) {
  toastQueue.push({ msg, isError });
  if (!toastBusy) nextToast();
}
function nextToast() {
  const item = toastQueue.shift();
  if (!item) {
    toastBusy = false;
    return;
  }
  toastBusy = true;
  els.toastMsg.textContent = item.msg;
  els.toastIcon.innerHTML = icon(item.isError ? "alert" : "check", 15);
  els.toast.classList.toggle("error", item.isError);
  els.toast.hidden = false;
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
    toastGapTimer = setTimeout(nextToast, 160);
  }, 3200);
}
const reduceMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function scopeValue() {
  return state.scope === "music" ? "yt_music" : "youtube";
}
function scopeName() {
  return state.scope === "music" ? "Music" : "YouTube sin música";
}
function isMusicScope() {
  return state.scope === "music";
}
function periodPlays() {
  return dataView().plays;
}
function allPlays() {
  return dataView().allPlays;
}
function meta(items) {
  const v = dataView();
  if (items === store.interactions) return v.inter;
  if (items === store.searches) return v.searches;
  if (items === store.channelVisits) return v.visits;
  return items.filter((it) =>
    matchesPeriodAndSourceOnly(it, state.period, scopeValue(), true),
  );
}
function metaAll(items) {
  const v = dataView();
  if (items === store.interactions) return v.allInter;
  if (items === store.searches) return v.allSearches;
  if (items === store.channelVisits) return v.allVisits;
  return items.filter((it) =>
    matchesPeriodAndSourceOnly(it, "all", scopeValue(), false),
  );
}
function prevPeriodPlays() {
  if (state.period === "all") return [];
  const days = Number(state.period);
  const now = Date.now();
  const from = now - days * 86400000;
  const prevFrom = from - days * 86400000;
  const scope = scopeValue();
  const idx = getDataIndex();
  const out = [];
  for (const [dk, b] of idx.byDay) {
    const t = Date.parse(`${dk}T12:00:00`);
    if (t < prevFrom - 86400000 || t > from + 86400000) continue;
    for (const p of b.plays) {
      if (
        p.timestamp >= prevFrom &&
        p.timestamp < from &&
        matchesFilter(p, "all", scope, false)
      )
        out.push(p);
    }
  }
  return out;
}
function periodLabel() {
  return PERIODS.find(([v]) => v === state.period)?.[1] || "Mi Recap";
}
function openUrl(url) {
  if (url) window.open(url, "_blank", "noopener");
}
function jumpToTab(tabId) {
  const t = npService.tabs.get(tabId);
  if (!t) return;
  chrome.tabs.update(t.id, { active: true });
  chrome.windows.update(t.windowId, { focused: true });
}
async function sendControl(action, value, tabId = state.currentTabId) {
  if (tabId == null) {
    toast("No hay ninguna pestaña de YouTube activa.");
    return false;
  }
  try {
    const res = await chrome.tabs.sendMessage(tabId, {
      type: "RECAP_CONTROL",
      action,
      value,
    });
    if (!res?.ok) {
      toast("Esa acción no está disponible en esta pestaña.");
      return false;
    }
    return true;
  } catch {
    toast("La pestaña ya no está disponible.", true);
    return false;
  }
}
function dedupeSessions(items) {
  const map = new Map();
  for (const it of items) {
    const k = getGroupKey(it);
    const cur = map.get(k);
    if (!cur || it.timestamp > cur.timestamp) map.set(k, it);
  }
  return [...map.values()].sort((a, b) => b.timestamp - a.timestamp);
}
function formatTag(it) {
  if (it.contentType === "short") return "Short";
  if (it.contentType === "live") return "Live";
  if (it.source === "yt_music") return "YT Music";
  if (isMusicItem(it)) return "Música";
  return "";
}
function highlight(text, q) {
  const frag = document.createDocumentFragment();
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (!q || idx < 0) {
    frag.append(text);
    return frag;
  }
  frag.append(text.slice(0, idx));
  const mark = el("mark", null, text.slice(idx, idx + q.length));
  frag.append(mark, text.slice(idx + q.length));
  return frag;
}
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
function playIds(ids, label) {
  const clean = [...new Set(ids.filter(Boolean))].slice(0, 50);
  if (!clean.length) {
    toast(`No hay videos con ID para armar la playlist de ${label}.`);
    return;
  }
  openInstantPlaylist(clean);
}
function cancelCountUps() {
  for (const id of countUps) cancelAnimationFrame(id);
  countUps.clear();
}
function countUp(node, to, fmt) {
  if (!ANIM) {
    node.textContent = fmt(to);
    return;
  }
  const dur = 680,
    t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    node.textContent = fmt(Math.round(to * e));
    if (k < 1) {
      const id = requestAnimationFrame(step);
      countUps.add(id);
    }
  };
  const id = requestAnimationFrame(step);
  countUps.add(id);
}

// ---------- firmas + memo ----------
function computeSigs() {
  const idx = getDataIndex();
  const v = dataView();
  const plays = v.plays;
  let struct = `${state.scope}|${state.route}|${state.detail || ""}|${state.period}|${state.peopleSort}|${state.peopleMinSec}|${state.peopleQuery}|${state.likesTab}|${state.hoursMode}|${state.showGhost}|${idx.sig}`;
  if (state.route === "calendar") {
    let hh = 0;
    for (const [dk, b] of idx.byDay) {
      const has = b.plays.length || b.inter.length || b.searches.length;
      if (!has) continue;
      hh = (hh * 31 + hashStr(`${dk}:${Math.round(b.sec / 60)}`)) | 0;
    }
    struct += `|cal${hh}|${calUi.calYear}|${calUi.calMonth}|${calUi.calViewMode}|${calUi.selectedDateKey}|${calUi.calDayMode}|${calUi.calSearchQuery}|${calUi.calScale}|${calUi.calLevelFilter ?? "x"}|${calUi.calRangeAnchor || ""}|${calUi.calRangeEnd || ""}|${calUi.calWeekOpen ?? "x"}|${calUi.calYrZoom}`;
  }
  let totalSeconds = 0,
    loops = 0;
  const hours = new Array(24).fill(0);
  for (const p of plays) {
    totalSeconds += p.seconds || 0;
    if (p.isLoop) loops += 1;
    hours[new Date(p.timestamp).getHours()] += p.seconds || 0;
  }
  return {
    struct,
    metrics: `${totalSeconds}|${loops}|${hours.indexOf(Math.max(...hours))}`,
  };
}
function memoVM(tag, fn) {
  const sigKey = `${state.sigs?.struct}|${state.sigs?.metrics}`;
  if (memoSigKey !== sigKey) {
    memo.clear();
    memoSigKey = sigKey;
  }
  if (!memo.has(tag)) memo.set(tag, fn());
  return memo.get(tag);
}
const vmSummary = () => memoVM("summary", () => summaryVM(periodPlays()));
const vmHome = () =>
  memoVM("home", () =>
    homeVM(
      periodPlays(),
      allPlays(),
      metaAll(store.interactions),
      metaAll(store.searches),
      metaAll(store.channelVisits),
    ),
  );

const vmActivity = () =>
  memoVM("activity", () =>
    activityVM(
      periodPlays(),
      meta(store.interactions),
      meta(store.searches),
      dataView().skips,
    ),
  );
const vmInsights = () =>
  memoVM("insights", () => exploreInsightsVM(periodPlays(), prevPeriodPlays()));
const vmMicro = () =>
  memoVM("micro", () => kpiMicroVM(periodPlays(), prevPeriodPlays()));
const vmPrevHours = () =>
  memoVM("prevHours", () => prevHoursVM(prevPeriodPlays()));
const vmNarrative = () =>
  memoVM("narrative", () => insightsVM(periodPlays(), prevPeriodPlays()));
const vmFormats = () => memoVM("formats", () => formatsVM(periodPlays()));
const vmLikesPage = () =>
  memoVM("likesPage", () =>
    likesPageVM(meta(store.interactions), meta(store.searches), periodPlays()),
  );
const vmDirectory = () =>
  memoVM("directory", () =>
    isMusicScope()
      ? artistDirectoryVM(
          periodPlays(),
          meta(store.interactions),
          state.peopleSort,
          state.peopleQuery,
        )
      : channelDirectoryVM(
          periodPlays(),
          meta(store.channelVisits),
          state.peopleSort,
          state.peopleMinSec,
          state.peopleQuery,
        ),
  );
const vmCalHero = () =>
  memoVM(`calHero:${calUi.calYear}`, () =>
    calendarHeroVM(
      allPlays(),
      metaAll(store.interactions),
      metaAll(store.searches),
      calUi.calYear,
    ),
  );
const vmYearHeat = () =>
  memoVM(`yearHeat:${calUi.calYear}`, () =>
    yearHeatVM(allPlays(), calUi.calYear),
  );

// ---------- tooltip ----------
function showTip(text, x, y) {
  els.chartTip.textContent = text;
  els.chartTip.hidden = false;
  const pad = 14,
    r = els.chartTip.getBoundingClientRect();
  let left = x + pad,
    top = y + pad;
  if (left + r.width > innerWidth - 8) left = x - r.width - pad;
  if (top + r.height > innerHeight - 8) top = y - r.height - pad;
  els.chartTip.style.left = `${Math.max(8, left)}px`;
  els.chartTip.style.top = `${Math.max(8, top)}px`;
}
function hideTip() {
  els.chartTip.hidden = true;
}
function tipify(node, textFn) {
  node.addEventListener("mousemove", (e) =>
    showTip(textFn(), e.clientX, e.clientY),
  );
  node.addEventListener("mouseleave", hideTip);
}

// ---------- router + historial ----------
function parseHash() {
  const m = location.hash.match(/^#\/(music|youtube)\/([a-z]+)(?:\/(.+))?$/);
  if (m) {
    state.scope = m[1];
    state.route = els.routes[m[2]] ? m[2] : "home";
    state.detail = m[3] ? decodeURIComponent(m[3]) : null;
  }
}
const navHist = { entries: [], idx: -1 };
const navKey = (s, r, d) => `${s}|${r}|${d || ""}`;
function pushNavEntry() {
  const k = navKey(state.scope, state.route, state.detail);
  if (navHist.entries[navHist.idx] === k) return;
  navHist.entries = navHist.entries.slice(0, navHist.idx + 1);
  navHist.entries.push(k);
  navHist.idx = navHist.entries.length - 1;
  updateNavButtons();
}
function updateNavButtons() {
  els.navBack.disabled = navHist.idx <= 0;
  els.navFwd.disabled = navHist.idx >= navHist.entries.length - 1;
}
function goHist(delta) {
  const i = navHist.idx + delta;
  if (i < 0 || i >= navHist.entries.length) return;
  navHist.idx = i;
  const [s, r, d] = navHist.entries[i].split("|");
  navigate(s, r, d || null);
  updateNavButtons();
}
function navigate(scope, route, detail = null) {
  state.scope = scope;
  state.route = route;
  state.detail = detail;
  state.perScopeRoute[scope] = route;
  state.animateNext = true;
  localStorage.setItem("recapFullScope", scope);
  localStorage.setItem(
    scope === "music" ? "recapRouteMusic" : "recapRouteYoutube",
    route,
  );
  pushNavEntry();
  const hash = `#/${scope}/${route}${detail ? `/${encodeURIComponent(detail)}` : ""}`;
  if (location.hash !== hash) location.hash = hash;
  else renderAll();
}
window.addEventListener("hashchange", () => {
  parseHash();
  pushNavEntry();
  renderAll();
});

// ---------- micro visuales ----------
function sparkArea(values, { w = 320, h = 92, id = "sa" } = {}) {
  const max = Math.max(...values, 1);
  const pts = values.map(
    (v, i) =>
      `${((i / Math.max(1, values.length - 1)) * w).toFixed(1)},${(h - (v / max) * (h - 10) - 4).toFixed(1)}`,
  );
  const last = pts[pts.length - 1].split(",");
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stop-color="var(--accent-red)" stop-opacity=".5"/><stop offset="100%" stop-color="var(--accent-red)" stop-opacity="0"/>
</linearGradient></defs>
<path d="M0,${h} L${pts.join(" L")} L${w},${h} Z" fill="url(#${id})"/>
<polyline points="${pts.join(" ")}" fill="none" stroke="var(--accent-pink)" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="var(--accent-pink)"/>
</svg>`;
}
function microBars(values) {
  const max = Math.max(...values, 1);
  const box = el("div", "micro-bars");
  for (const v of values) {
    const i = el("i", v > 0 ? "" : "zero");
    i.style.height = `${Math.max(6, (v / max) * 100)}%`;
    box.append(i);
  }
  return box;
}
function microDots(days7) {
  const box = el("div", "micro-dots");
  for (const d of days7) box.append(el("i", d.active ? "on" : ""));
  return box;
}
function microTicks(hours) {
  const max = Math.max(...hours, 1);
  const peak = hours.indexOf(max);
  const box = el("div", "micro-ticks");
  hours.forEach((v, i) => {
    const t = el("i", i === peak && v > 0 ? "peak" : "");
    t.style.height = `${Math.max(6, (v / max) * 100)}%`;
    box.append(t);
  });
  return box;
}
function microRatio(ratio) {
  const box = el("div", "micro-ratio");
  const fill = el("i");
  fill.style.width = `${Math.round(Math.min(1, ratio) * 100)}%`;
  box.append(fill);
  return box;
}
function microRing(ratio) {
  const r = 12,
    c = 2 * Math.PI * r,
    len = Math.min(1, ratio) * c;
  const box = el("div", "micro-ring");
  box.innerHTML = `<svg viewBox="0 0 30 30"><circle cx="15" cy="15" r="${r}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="4"/>
<circle cx="15" cy="15" r="${r}" fill="none" stroke="var(--accent-pink)" stroke-width="4" stroke-linecap="round"
stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" transform="rotate(-90 15 15)"/></svg>`;
  return box;
}

// ---------- componentes ----------
function kpiCard({
  key,
  iconName,
  label,
  value,
  delta,
  note,
  micro,
  countTo,
  fmt,
}) {
  const card = el("div", "kpi-card");
  if (key) card.dataset.kpi = key;
  const top = el("div", "kpi-top");
  const ico = el("span", "kpi-ico");
  ico.innerHTML = icon(iconName, 15);
  top.append(ico, el("span", "kpi-label", label));
  const val = el("strong", "kpi-value", value);
  card.append(top, val);
  if (countTo != null && fmt) countUp(val, countTo, fmt);
  if (micro) {
    const m = el("div", "kpi-micro");
    m.append(micro);
    card.append(m);
  }
  const foot = el("div", "kpi-foot");
  if (delta != null) {
    const cls = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    foot.append(
      el(
        "span",
        `kpi-delta ${cls}`,
        `${delta > 0 ? "▲" : delta < 0 ? "▼" : "■"} ${Math.abs(delta)}%`,
      ),
      el("span", "kpi-note", "vs período anterior"),
    );
  } else if (note) foot.append(el("span", "kpi-note", note));
  if (foot.childNodes.length) card.append(foot);
  return card;
}
function kpiStrip(cards, cols) {
  const s = el("div", `kpi-strip${cols ? ` cols-${cols}` : ""}`);
  s.append(...cards);
  return s;
}
function pageHero({
  eyebrow,
  title,
  desc,
  cover,
  visual,
  actions,
  kpis,
  insight,
}) {
  const hero = el("section", `page-hero${visual ? " has-visual" : ""}`);
  const left = el("div", "hero-left");
  if (cover) left.append(cover);
  const text = el("div", "hero-text");
  if (eyebrow) text.append(el("span", "hero-eyebrow", eyebrow));
  const h = el("h2", "hero-title route-title", title);
  h.tabIndex = -1;
  text.append(h);
  if (desc) text.append(el("div", "hero-desc", desc));
  if (actions?.length) {
    const row = el("div", "hero-actions");
    row.append(...actions);
    text.append(row);
  }
  left.append(text);
  hero.append(left);
  if (visual) hero.append(visual);
  const frag = document.createDocumentFragment();
  frag.append(hero);
  if (insight) {
    const chip = el("div", "insight-chip");
    const i = el("span");
    i.innerHTML = icon(insight.icon || "bulb", 16);
    const t = el("span");
    t.innerHTML = insight.text;
    chip.append(i, t);
    frag.append(chip);
  }
  if (kpis?.length)
    frag.append(kpiStrip(kpis, kpis.length <= 4 ? kpis.length : null));
  return frag;
}
function primaryBtn(label, iconName, onClick) {
  const b = el("button", "btn-primary");
  b.type = "button";
  b.innerHTML = icon(iconName, 16);
  b.append(` ${label}`);
  b.addEventListener("click", onClick);
  return b;
}
function ghostBtn(label, iconName, onClick) {
  const b = el("button", "btn-ghost");
  b.type = "button";
  if (iconName) b.innerHTML = icon(iconName, 15);
  b.append(iconName ? ` ${label}` : label);
  b.addEventListener("click", onClick);
  return b;
}
function panel({ title, sub, tools, span = 12, body, iconName }) {
  const p = el("section", `panel span-${span}`);
  const head = el("div", "panel-head");
  if (iconName) {
    const i = el("span", "panel-ico");
    i.innerHTML = icon(iconName, 15);
    head.append(i);
  }
  head.append(el("h3", "panel-title", title));
  if (sub) head.append(el("span", "panel-sub", sub));
  if (tools?.length) {
    const t = el("div", "panel-tools");
    t.append(...tools);
    head.append(t);
  }
  p.append(head);
  const b = el("div", "panel-body");
  if (body) b.append(body);
  p.append(b);
  p._body = b;
  return p;
}
function pillRow(items, active, onPick, ariaLabel) {
  const row = el("div", "pill-row");
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", ariaLabel || "Filtros");
  for (const it of items) {
    const b = el("button", `pill${it.value === active ? " active" : ""}`);
    b.type = "button";
    b.dataset.value = String(it.value);
    b.setAttribute("aria-pressed", String(it.value === active));
    if (it.icon) b.innerHTML = icon(it.icon, 13);
    b.append(it.icon ? ` ${it.label}` : it.label);
    b.addEventListener("click", () => onPick(it.value, b, row));
    row.append(b);
  }
  return row;
}
function setPills(row, value) {
  [...row.children].forEach((b) => {
    const on = b.dataset.value === String(value);
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
}
function tinyToggle(label, iconName, on, onClick) {
  const b = el("button", `pill tiny${on ? " active" : ""}`);
  b.type = "button";
  b.setAttribute("aria-pressed", String(on));
  b.innerHTML = icon(iconName, 12);
  b.append(` ${label}`);
  b.addEventListener("click", onClick);
  return b;
}
function emptyState(iconName, msg, action) {
  const box = el("div", "empty-cta");
  const i = el("span");
  i.innerHTML = icon(iconName, 26);
  box.append(i, el("p", null, msg));
  if (action) box.append(action);
  return box;
}
function donutChart(segments) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const wrap = el("div", "donut-wrap");
  if (!total) {
    wrap.append(
      emptyState(
        "chart",
        "Todavía no hay reproducciones en este período para graficar formatos.",
      ),
    );
    return wrap;
  }
  const r = 62,
    c = 2 * Math.PI * r;
  let offset = 0;
  const rings = segments
    .map((s, i) => {
      const len = (s.value / total) * c;
      const out = `<circle class="seg" data-i="${i}" cx="84" cy="84" r="${r}" fill="none" stroke="${s.color}" stroke-width="19" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 84 84)"><title>${s.label}: ${s.value}</title></circle>`;
      offset += len;
      return out;
    })
    .join("");
  const holder = el("div");
  holder.innerHTML = `<svg class="donut" viewBox="0 0 168 168" role="img" aria-label="Distribución de formatos"><circle cx="84" cy="84" r="${r}" fill="none" stroke="var(--surface-inset)" stroke-width="19"/>${rings}<text class="donut-total" x="84" y="80" text-anchor="middle">${total}</text><text class="donut-cap" x="84" y="99" text-anchor="middle">reprod.</text></svg>`;
  const svg = holder.firstChild;
  wrap.append(svg);
  const legend = el("div", "donut-legend");
  const rows = segments.map((s, i) => {
    const row = el("div", "legend-row");
    row.dataset.i = String(i);
    const dot = el("span", "legend-dot");
    dot.style.background = s.color;
    row.append(
      dot,
      el("span", "legend-label", s.label),
      el("span", "legend-val", String(s.value)),
      el("span", "legend-pct", `${Math.round((s.value / total) * 100)}%`),
    );
    legend.append(row);
    return row;
  });
  const hot = (i) => {
    svg.classList.toggle("dim", i != null);
    svg
      .querySelectorAll(".seg")
      .forEach((s) => s.classList.toggle("hot", s.dataset.i === String(i)));
    rows.forEach((r2) =>
      r2.classList.toggle("hot", r2.dataset.i === String(i)),
    );
  };
  svg.querySelectorAll(".seg").forEach((s) => {
    s.addEventListener("mouseenter", () => hot(s.dataset.i));
    s.addEventListener("mouseleave", () => hot(null));
  });
  rows.forEach((r2) => {
    r2.addEventListener("mouseenter", () => hot(r2.dataset.i));
    r2.addEventListener("mouseleave", () => hot(null));
  });
  wrap.append(legend);
  return wrap;
}
function barChart({
  values,
  prev,
  labels,
  fullLabels,
  mode = "bars",
  ghost = false,
  selected = null,
  onPick,
  night = () => false,
  noun = "",
}) {
  const max = Math.max(...values, ...(ghost && prev ? prev : [0]), 1);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const peakIdx = values.indexOf(Math.max(...values));
  const wrap = el("div", `hx${ANIM ? " anim" : ""}`);
  const axis = el("div", "hx-axis");
  for (const f of [1, 0.5, 0])
    axis.append(el("span", null, formatDuration(Math.round(max * f))));
  wrap.append(axis);
  const plot = el("div", "hx-plot");
  for (const f of [0, 0.5, 1]) {
    const g = el("div", "hx-grid");
    g.style.bottom = `${f * 100}%`;
    plot.append(g);
  }
  if (avg > 0) {
    const a = el("div", "hx-avg");
    a.style.bottom = `${(avg / max) * 100}%`;
    a.append(
      el("span", "hx-avg-lbl", `prom. ${formatDuration(Math.round(avg))}`),
    );
    plot.append(a);
  }
  const bars = el("div", `hx-bars${mode === "area" ? " as-hit" : ""}`);
  values.forEach((sec, i) => {
    const cell = el(
      "div",
      `hx-cell${night(i) ? " night" : ""}${i === peakIdx && sec > 0 ? " peak" : ""}${selected === i ? " selected" : ""}`,
    );
    if (ghost && prev && prev[i] > 0) {
      const g = el("div", "hx-ghost");
      g.style.height = `${(prev[i] / max) * 100}%`;
      cell.append(g);
    }
    const bar = el("div", `hx-bar${sec === 0 ? " zero" : ""}`);
    bar.style.height = `${Math.max(2, (sec / max) * 100)}%`;
    cell.append(
      bar,
      el("span", "hx-val", `${fullLabels[i]} · ${formatDuration(sec)}`),
    );
    cell.tabIndex = 0;
    cell.setAttribute("role", "button");
    cell.setAttribute(
      "aria-label",
      `${fullLabels[i]} — ${formatDuration(sec)}${noun ? ` ${noun}` : ""}`,
    );
    const pick = () => onPick?.(i);
    cell.addEventListener("click", pick);
    cell.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pick();
      }
    });
    cell.addEventListener("mousemove", (e) =>
      showTip(
        `${fullLabels[i]} — ${formatDuration(sec)}${ghost && prev ? ` · antes ${formatDuration(prev[i])}` : ""}`,
        e.clientX,
        e.clientY,
      ),
    );
    cell.addEventListener("mouseleave", hideTip);
    bars.append(cell);
  });
  plot.append(bars);
  if (mode === "area") {
    const w = 1000,
      h = 200;
    const pts = values.map(
      (s, i) =>
        `${((i / Math.max(1, values.length - 1)) * w).toFixed(1)},${(h - (s / max) * h).toFixed(1)}`,
    );
    const holder = el("div", "hx-area");
    holder.innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="hxa" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent-red)" stop-opacity=".55"/><stop offset="100%" stop-color="var(--accent-red)" stop-opacity="0"/></linearGradient></defs><path d="M0,${h} L${pts.join(" L")} L${w},${h} Z" fill="url(#hxa)"/><polyline points="${pts.join(" ")}" fill="none" stroke="var(--accent-pink)" stroke-width="3" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
    plot.append(holder.firstChild);
  }
  if (values[peakIdx] > 0) {
    const ann = el("div", "hx-peak");
    ann.style.left = `${((peakIdx + 0.5) / values.length) * 100}%`;
    ann.innerHTML = icon("trophy", 12);
    ann.append(` ${fullLabels[peakIdx]} · ${formatDuration(values[peakIdx])}`);
    plot.append(ann);
  }
  wrap.append(plot);
  const lbl = el("div", "hx-labels");
  for (const t of labels) lbl.append(el("span", null, t));
  wrap.append(lbl);
  return wrap;
}
function insightsPanel(items) {
  const p = panel({
    iconName: "bulb",
    title: "Insights",
    sub: "lecturas de tu propio historial",
    span: 12,
  });
  if (!items.length) {
    p._body.append(
      emptyState(
        "bulb",
        "Todavía no hay suficiente actividad para generar lecturas.",
      ),
    );
    return p;
  }
  const list = el("div", "insights");
  for (const it of items) {
    const actionable = it.action && it.action.type !== "none";
    const b = el("button", `insight tone-${it.tone}`);
    b.type = "button";
    const i = el("span", "insight-ico");
    i.innerHTML = icon(it.icon, 16);
    const t = el("span", "insight-text");
    t.innerHTML = it.text;
    b.append(i, t);
    if (actionable) {
      const go = el("span", "insight-go");
      go.innerHTML = icon("chevronRight", 14);
      b.append(go);
      b.addEventListener("click", () => runInsight(it.action));
    } else b.disabled = true;
    list.append(b);
  }
  p._body.append(list);
  return p;
}
function runInsight(a) {
  if (a.type === "calendar") {
    if (a.y != null) {
      calUi.calYear = a.y;
      calUi.calMonth = a.m;
      calUi.selectedDateKey = toDateKey(new Date(a.y, a.m, a.d));
      calUi.calViewMode = "month";
    }
    navigate(state.scope, "calendar");
  } else if (a.type === "hour") {
    state.hourFilter = a.h;
    navigate(state.scope, "explore");
  } else if (a.type === "people") navigate(state.scope, "people", a.name);
}
function rankRow({
  rank,
  thumb,
  round,
  name,
  sub,
  value,
  pct,
  tag,
  href,
  onOpen,
  medal,
}) {
  const row = el("button", `pt-row${pct == null ? " no-bar" : ""}`);
  row.type = "button";
  row.append(el("span", `pt-rank${medal ? ` g${medal}` : ""}`, String(rank)));
  let img;
  if (thumb) {
    img = el("img", `pt-thumb${round ? " round" : ""}`);
    img.src = thumb;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    attachImgFallback(img, name);
  } else {
    img = el("span", `pt-thumb${round ? " round" : ""}`);
    const mono = createMonogram(name);
    mono.style.fontSize = "15px";
    img.append(mono);
  }
  const metaBox = el("div", "pt-meta");
  const t = el("div", "pt-title", name);
  if (tag) t.append(el("span", "pt-tag", tag));
  metaBox.append(t, el("div", "pt-sub", sub || ""));
  row.append(img, metaBox);
  if (pct != null) {
    const bar = el("div", "pt-bar");
    const fill = el("div", "pt-bar-fill");
    fill.style.width = `${Math.max(2, Math.min(100, pct))}%`;
    bar.append(fill);
    row.append(bar);
  }
  row.append(el("span", "pt-value", value));
  row.title = name;
  row.addEventListener("click", () => {
    if (onOpen) onOpen();
    else openUrl(href);
  });
  return row;
}
function personTile({ name, artwork, meta: m, sub, onOpen, onPlay }) {
  const card = el("button", "person-card");
  card.type = "button";
  const av = el("div", "person-avatar");
  if (artwork) {
    const img = el("img");
    img.src = artwork;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    attachImgFallback(img, name);
    av.append(img);
  } else av.append(createMonogram(name));
  if (onPlay) {
    const p = el("span", "person-play");
    p.innerHTML = icon("play", 15);
    p.setAttribute("aria-hidden", "true");
    av.append(p);
  }
  card.append(av, el("div", "person-name", name));
  if (m) card.append(el("div", "person-meta", m));
  if (sub) card.append(el("div", "person-sub", sub));
  card.title = name;
  card.addEventListener("click", (e) => {
    if (onPlay && e.target.closest(".person-play")) {
      onPlay();
      return;
    }
    onOpen();
  });
  return card;
}
function directoryGrid(items, makeTile, batch = 24) {
  const wrap = el("div");
  const grid = el("div", "directory-grid");
  let shown = 0;
  const more = el("button", "grid-more");
  more.type = "button";
  const paint = () => {
    const next = items.slice(shown, shown + batch);
    grid.append(...next.map(makeTile));
    shown += next.length;
    if (shown >= items.length) more.remove();
    else more.textContent = `Mostrar más (${items.length - shown})`;
  };
  more.addEventListener("click", paint);
  paint();
  wrap.append(grid);
  if (shown < items.length) wrap.append(more);
  return wrap;
}

// ---------- hero visuals ----------
function heroVisualExplore() {
  const ins = vmInsights(),
    sum = ins.sum;
  const v = el("button", "hero-visual");
  v.type = "button";
  const total = el("div", "hv-total");
  total.append(
    el("strong", null, sum.empty ? "0 min" : formatDuration(sum.totalSeconds)),
    el("span", null, "últimos 14 días"),
  );
  const chart = el("div", "hv-chart");
  chart.innerHTML = sparkArea(ins.trend, { id: "hvsa" });
  const covers = el("div", "hv-covers");
  for (const t of sum.empty ? [] : sum.topTracks.slice(0, 4)) {
    if (t.artwork) {
      const img = el("img");
      img.src = t.artwork;
      img.alt = "";
      img.loading = "lazy";
      attachImgFallback(img, t.artist);
      covers.append(img);
    } else covers.append(createMonogram(t.artist || t.title));
  }
  v.append(total, chart, covers);
  v.title = "Ver el mes más fuerte en el calendario";
  v.addEventListener("click", () => {
    const best = vmHome()
      .months.filter((m) => m.plays > 0)
      .sort((a, b) => b.seconds - a.seconds)[0];
    if (best) {
      calUi.calYear = best.y;
      calUi.calMonth = best.m;
      calUi.selectedDateKey = toDateKey(new Date(best.y, best.m, 1));
      calUi.calViewMode = "month";
    }
    navigate(state.scope, "calendar");
  });
  return v;
}
function heroVisualCalendar() {
  const heat = vmYearHeat();
  const v = el("button", "hero-visual hv-heat");
  v.type = "button";
  const cols = Math.ceil(heat.cells.length / 7);
  const size = 8,
    gap = 2,
    labelH = 11;
  const w = cols * (size + gap),
    h = 7 * (size + gap) + labelH;
  const colors = [
    "var(--cal-0)",
    "var(--cal-1)",
    "var(--cal-2)",
    "var(--cal-3)",
    "var(--cal-4)",
  ];
  const rects = heat.cells
    .map((c, i) => {
      if (!c) return "";
      const col = Math.floor(i / 7),
        row = i % 7;
      const lv = heat.maxSec > 0 ? c.relLevel : c.level;
      return `<rect x="${col * (size + gap)}" y="${row * (size + gap) + labelH}" width="${size}" height="${size}" rx="2" fill="${colors[lv]}"><title>${c.key}</title></rect>`;
    })
    .join("");
  const labels = heat.monthLabels
    .map(
      (m) =>
        `<text x="${(m.col - 1) * (size + gap)}" y="8" fill="var(--text-faint)" font-size="7.5" font-weight="700">${m.short}</text>`,
    )
    .join("");
  const holder = el("div");
  holder.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Mapa de calor de ${calUi.calYear}">${labels}${rects}</svg>`;
  const cap = el("div", "hv-heat-cap");
  cap.append(
    el("span", null, `${calUi.calYear} · ${heat.activeDays} días`),
    el("span", null, `${formatDuration(heat.total)} · clic para vista anual`),
  );
  v.append(holder.firstChild, cap);
  v.title = "Abrir la vista anual del calendario";
  v.addEventListener("click", () => {
    calUi.calViewMode = "year";
    syncCalModeButtons();
    state.sigs = computeSigs();
    renderCalendarRoute();
  });
  return v;
}
function heroVisualPeople(list) {
  const v = el("div", "hero-visual");
  const cap = el("div", "hv-heat-cap");
  cap.append(
    el("span", null, isMusicScope() ? "Tus artistas" : "Tus canales"),
    el("span", null, `${list.length} en el período`),
  );
  const grid = el("div", "hv-collage");
  for (const a of list.slice(0, 6)) {
    const cell = el("div", "hv-av");
    const art = a.artwork || a.avatar;
    if (art) {
      const img = el("img");
      img.src = art;
      img.alt = "";
      img.loading = "lazy";
      attachImgFallback(img, a.name);
      cell.append(img);
    } else cell.append(createMonogram(a.name));
    grid.append(cell);
  }
  v.append(cap, grid);
  return v;
}

// ---------- shell ----------
function renderInlineStats(sum) {
  els.inlineStats.replaceChildren();
  if (!sum.empty) {
    const s = (t) => el("strong", null, t);
    els.inlineStats.append(
      s(String(sum.totalPlays)),
      " rep · ",
      s(formatDuration(sum.totalSeconds)),
      " · ",
      s(String(sum.unique)),
      " únicos",
    );
  } else els.inlineStats.textContent = "Sin datos en este período";
}
function renderShell() {
  document.body.dataset.scope = state.scope;
  document.title =
    state.scope === "music" ? "Recap · Music" : "Recap · YouTube";
  els.brandWord.textContent = state.scope === "music" ? "Music" : "YouTube";
  els.brandLogo.innerHTML = icon(
    state.scope === "music" ? "music" : "youtube",
    16,
  );
  els.brandBtn.title =
    state.scope === "music"
      ? "Cambiar a YouTube sin música"
      : "Cambiar a Music";
  els.brandBtn.setAttribute("aria-label", els.brandBtn.title);
  els.peopleLabel.textContent =
    state.scope === "music" ? "Artistas" : "Canales";
  els.libraryLabel.textContent = isMusicScope()
    ? "Tus artistas"
    : "Tus canales";
  els.homeBtn.classList.toggle("active", state.route === "home");
  els.sideNav.querySelectorAll(".side-link").forEach((b) => {
    const active = b.dataset.route === state.route;
    b.classList.toggle("active", active);
    if (active) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  els.periodChips.replaceChildren(
    ...PERIODS.map(([value, label]) => {
      const b = el(
        "button",
        `period-chip${state.period === value ? " active" : ""}`,
        label,
      );
      b.type = "button";
      b.addEventListener("click", () => {
        state.period = value;
        state.animateNext = true;
        localStorage.setItem("recapFullPeriod", value);
        renderAll();
      });
      return b;
    }),
  );
  renderInlineStats(vmSummary());
  renderSideLists();
}
function renderSideLists() {
  const vm = vmHome(),
    nodes = [];
  const q = (state.libQuery || "").trim().toLowerCase();
  const liked = meta(store.interactions).filter((it) => it.type === "like");
  const likedLabel = isMusicScope() ? "Liked Music" : "Me gusta (videos)";
  if (!q || likedLabel.toLowerCase().includes(q)) {
    const b = el("button", "lib-row");
    b.type = "button";
    const cov = el("span", "lib-cover liked");
    cov.innerHTML = icon("heartFill", 18);
    const m = el("div", "lib-meta");
    m.append(
      el("strong", null, likedLabel),
      el("span", null, `${liked.length} me gusta · lista`),
    );
    b.append(cov, m);
    b.addEventListener("click", () => navigate(state.scope, "likes"));
    nodes.push(b);
  }
  for (const m of vm.months.slice(0, 12)) {
    if (!m.plays) continue;
    const label = `${m.label} Recap '${String(m.year).slice(2)}`;
    if (q && !label.toLowerCase().includes(q)) continue;
    const b = el("button", "lib-row");
    b.type = "button";
    const cov = el("span", "lib-cover month", m.label.slice(0, 1));
    const metaBox = el("div", "lib-meta");
    const s = el(
      "span",
      null,
      `${formatDuration(m.seconds)} · ${m.plays} rep.`,
    );
    s.dataset.month = `${m.y}-${m.m}`;
    metaBox.append(el("strong", null, label), s);
    b.append(cov, metaBox);
    b.addEventListener("click", () => {
      calUi.calYear = m.y;
      calUi.calMonth = m.m;
      calUi.selectedDateKey = toDateKey(new Date(m.y, m.m, 1));
      calUi.calViewMode = "month";
      navigate(state.scope, "calendar");
    });
    nodes.push(b);
  }
  if (!nodes.length)
    nodes.push(el("div", "lib-meta", "Sin resultados en tu biblioteca."));
  els.sideLists.replaceChildren(...nodes);
}
function updateMetricsInPlace() {
  const sum = vmSummary();
  renderInlineStats(sum);
  const kpis = els.routes.home.querySelectorAll(".hero-kpi strong");
  if (kpis.length === 4) {
    kpis[0].textContent = sum.empty
      ? "0 min"
      : formatDuration(sum.totalSeconds);
    kpis[1].textContent = String(sum.empty ? 0 : sum.totalPlays);
    kpis[2].textContent = String(sum.empty ? 0 : sum.unique);
    kpis[3].textContent = String(sum.empty ? 0 : sum.streak);
  }
  const values = {
    seconds: sum.empty ? "0 min" : formatDuration(sum.totalSeconds),
    plays: String(sum.empty ? 0 : sum.totalPlays),
    unique: String(sum.empty ? 0 : sum.unique),
    streak: `${sum.empty ? 0 : sum.streak} días`,
    peak: sum.empty ? "—" : sum.peakLabel,
    loops: String(sum.empty ? 0 : sum.totalLoops),
  };
  if (state.route === "people" && !state.detail) {
    const t = vmDirectory().totals;
    values.dirSeconds = formatDuration(t.seconds || 0);
    values.dirPlays = String(t.plays || 0);
  }
  if (state.route === "likes")
    values.likedSeconds = formatDuration(vmLikesPage().totals.seconds);
  document.querySelectorAll("[data-kpi]").forEach((card) => {
    const v = values[card.dataset.kpi],
      node = card.querySelector(".kpi-value");
    if (node && v != null) node.textContent = v;
  });
  const months = vmHome().months;
  els.sideLists.querySelectorAll("[data-month]").forEach((sp) => {
    const m = months.find((x) => `${x.y}-${x.m}` === sp.dataset.month);
    if (m) sp.textContent = `${formatDuration(m.seconds)} · ${m.plays} rep.`;
  });
}

// ---------- cards / shelves ----------
function makeCard(opts) {
  const {
    kind = "square",
    artwork,
    title,
    sub,
    stat,
    href,
    onOpen,
    month,
    badge,
    tag,
    name,
  } = opts;
  const card = el("button", "card");
  card.type = "button";
  const cover = el(
    "div",
    "card-cover" +
      (kind === "wide" ? " wide" : "") +
      (kind === "round" ? " round" : "") +
      (kind === "month" ? " month" : ""),
  );
  if (kind === "month")
    cover.append(
      el("span", "m-name", month.label),
      el("span", "m-year", `${month.year} · ${month.plays} rep.`),
    );
  else if (artwork) {
    const img = el("img");
    img.src = artwork;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    attachImgFallback(img, name || title);
    cover.append(img);
  } else if (kind === "round") cover.append(createMonogram(name || title));
  else {
    const na = el("span", "no-art");
    na.innerHTML = icon(isMusicScope() ? "music" : "youtube", 34);
    cover.append(na);
  }
  if (tag) cover.append(el("span", "cover-tag", tag));
  if (badge) cover.append(el("span", "cover-badge", badge));
  if (href || onOpen) {
    const p = el("span", "card-play");
    p.setAttribute("aria-hidden", "true");
    p.innerHTML = icon("play", 16);
    cover.append(p);
  }
  card.append(
    cover,
    el("div", "card-title", title),
    el("div", "card-sub", sub || ""),
  );
  if (stat) card.append(el("div", "card-stat", stat));
  card.title = title;
  card.addEventListener("click", () => {
    if (onOpen) onOpen();
    else openUrl(href);
  });
  return card;
}
function skeletonRow() {
  const nodes = [];
  for (let i = 0; i < 5; i++) {
    const c = el("div", "skel-card");
    c.append(
      el("div", "skel-cover"),
      el("div", "skel-line"),
      el("div", "skel-line short"),
    );
    nodes.push(c);
  }
  return nodes;
}
function enableDrag(row) {
  let down = false,
    dragged = false,
    startX = 0,
    startScroll = 0;
  row.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    down = true;
    dragged = false;
    startX = e.clientX;
    startScroll = row.scrollLeft;
  });
  row.addEventListener("pointermove", (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (!dragged && Math.abs(dx) > 6) {
      dragged = true;
      row.classList.add("dragging");
      row.setPointerCapture(e.pointerId);
    }
    if (dragged) row.scrollLeft = startScroll - dx;
  });
  const end = () => {
    down = false;
    row.classList.remove("dragging");
  };
  row.addEventListener("pointerup", end);
  row.addEventListener("pointercancel", end);
  row.addEventListener(
    "click",
    (e) => {
      if (dragged) {
        e.stopPropagation();
        e.preventDefault();
        dragged = false;
      }
    },
    true,
  );
}
function shelf({ eyebrow, title, cardsFactory, moreRoute }) {
  const key = `${state.scope}|${state.route}|${state.detail || ""}|${state.period}|${title}`;
  const sec = el("section", "shelf");
  const head = el("div", "shelf-head");
  if (eyebrow) head.append(el("span", "shelf-eyebrow", eyebrow));
  head.append(el("h2", "shelf-title", title));
  const tools = el("div", "shelf-tools");
  if (moreRoute) {
    const more = el("button", "shelf-more", "Ver todo");
    more.type = "button";
    more.addEventListener("click", () => navigate(state.scope, moreRoute));
    tools.append(more);
  }
  const prev = el("button", "shelf-arrow");
  prev.type = "button";
  prev.setAttribute("aria-label", "Desplazar a la izquierda");
  prev.innerHTML = icon("chevronLeft", 16);
  const next = el("button", "shelf-arrow");
  next.type = "button";
  next.setAttribute("aria-label", "Desplazar a la derecha");
  next.innerHTML = icon("chevronRight", 16);
  tools.append(prev, next);
  head.append(tools);
  const row = el("div", "shelf-row");
  row.tabIndex = 0;
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", title);
  row.append(...skeletonRow());
  const updateArrows = () => {
    prev.disabled = row.scrollLeft <= 4;
    next.disabled = row.scrollLeft + row.clientWidth >= row.scrollWidth - 4;
  };
  prev.addEventListener("click", () =>
    row.scrollBy({ left: -row.clientWidth * 0.8, behavior: "smooth" }),
  );
  next.addEventListener("click", () =>
    row.scrollBy({ left: row.clientWidth * 0.8, behavior: "smooth" }),
  );
  row.addEventListener(
    "scroll",
    () => {
      shelfScroll.set(key, row.scrollLeft);
      updateArrows();
    },
    { passive: true },
  );
  row.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next.click();
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev.click();
    }
  });
  enableDrag(row);
  const mount = () => {
    if (sec._mounted) return;
    sec._mounted = true;
    row.replaceChildren(...cardsFactory());
    row.scrollLeft = shelfScroll.get(key) || 0;
    mountedRows.set(row, updateArrows);
    requestAnimationFrame(updateArrows);
  };
  pendingShelves.push({ sec, mount });
  sec.append(head, row);
  return sec;
}
function hydrateShelves() {
  const cr = els.content.getBoundingClientRect();
  for (const item of pendingShelves) {
    const { sec, mount } = item;
    if (sec._mounted) continue;
    const r = sec.getBoundingClientRect();
    if (
      (r.top < cr.bottom + 240 && r.bottom > cr.top - 240) ||
      !("IntersectionObserver" in window)
    )
      mount();
    else {
      const io = new IntersectionObserver(
        (entries) => {
          for (const en of entries)
            if (en.isIntersecting) {
              mount();
              io.disconnect();
              observers.delete(io);
            }
        },
        { root: els.content, rootMargin: "400px 0px" },
      );
      observers.add(io);
      io.observe(sec);
    }
  }
  pendingShelves.length = 0;
}
function trackCards(tracks, wide = false) {
  return tracks.map((t) =>
    makeCard({
      kind: wide ? "wide" : "square",
      artwork: t.artwork,
      title: t.title,
      sub: t.artist,
      name: t.artist,
      stat: `${t.plays}x · ${t.seconds > 0 ? formatDuration(t.seconds) : "importado"}`,
      badge: t.seconds > 0 ? formatClock(t.seconds) : "",
      tag: formatTag(t),
      href: t.videoUrl || resolveVideoUrl(t),
    }),
  );
}
function sessionCards(items, wide = false) {
  return items.map((p) =>
    makeCard({
      kind: wide ? "wide" : "square",
      artwork: p.artwork,
      title: p.title,
      sub: p.artist,
      name: p.artist,
      stat: relativeTime(p.timestamp),
      badge: p.seconds > 0 ? formatClock(p.seconds) : "",
      tag: formatTag(p),
      href: resolveVideoUrl(p),
    }),
  );
}
function peopleCards(list) {
  return list.map((a) =>
    makeCard({
      kind: "round",
      artwork: a.artwork || a.avatar,
      title: a.name,
      sub: `${a.plays} reproducciones`,
      stat: a.seconds > 0 ? formatDuration(a.seconds) : "visitas",
      onOpen: () => navigate(state.scope, "people", a.name),
    }),
  );
}
function monthCards(months) {
  return months
    .filter((m) => m.plays > 0)
    .map((m) =>
      makeCard({
        kind: "month",
        month: m,
        title: `${m.label} Recap '${String(m.year).slice(2)}`,
        sub: `${formatDuration(m.seconds)} · ${m.plays} rep.`,
        onOpen: () => {
          calUi.calYear = m.y;
          calUi.calMonth = m.m;
          calUi.selectedDateKey = toDateKey(new Date(m.y, m.m, 1));
          calUi.calViewMode = "month";
          navigate(state.scope, "calendar");
        },
      }),
    );
}
function trackTable(tracks, { showBar = false } = {}) {
  const max = Math.max(1, ...tracks.map((t) => t.seconds || 0));
  const list = el("div", "pt");
  tracks.forEach((t, i) =>
    list.append(
      rankRow({
        rank: i + 1,
        medal: i < 3 ? i + 1 : null,
        thumb: t.artwork,
        name: t.title,
        sub: t.artist,
        tag: formatTag(t),
        value: `${t.plays}x · ${t.seconds > 0 ? formatDuration(t.seconds) : "Imp."}`,
        pct: showBar ? Math.round(((t.seconds || 0) / max) * 100) : null,
        href: t.videoUrl || resolveVideoUrl(t),
      }),
    ),
  );
  return list;
}

// ---------- HOME ----------
function renderHome() {
  const plays = periodPlays(),
    vm = vmHome(),
    sum = vmSummary();
  const host = els.routes.home;
  host.replaceChildren();
  const hero = el("div", "hero");
  const g = el("h2", "route-title hero-greet", greeting());
  g.tabIndex = -1;
  hero.append(
    g,
    el("div", "hero-sub", `Tu recap de ${scopeName()} · ${periodLabel()}`),
  );
  const kpis = el("div", "hero-kpis");
  const kpi = (label, value) => {
    const k = el("span", "hero-kpi");
    k.append(el("strong", null, value), ` ${label}`);
    return k;
  };
  kpis.append(
    kpi("escuchados", sum.empty ? "0 min" : formatDuration(sum.totalSeconds)),
    kpi("reproducciones", String(sum.empty ? 0 : sum.totalPlays)),
    kpi("únicos", String(sum.empty ? 0 : sum.unique)),
    kpi("días de racha", String(sum.empty ? 0 : sum.streak)),
  );
  hero.append(kpis);
  host.append(hero);
  if (!plays.length) {
    host.append(
      emptyState(
        "spark",
        "Todavía no hay datos en este período. Reproducí al menos 20 segundos en YouTube o YT Music y volvé.",
        ghostBtn("Ver todo el historial", "clock", () => {
          state.period = "all";
          state.animateNext = true;
          localStorage.setItem("recapFullPeriod", "all");
          renderAll();
        }),
      ),
    );
    return;
  }
  if (isMusicScope()) {
    if (vm.top.length)
      host.append(
        shelf({
          eyebrow: "Tu recap",
          title: "Listen again",
          cardsFactory: () => trackCards(vm.top),
          moreRoute: "explore",
        }),
      );
    if (vm.forgotten.length)
      host.append(
        shelf({
          title: "Forgotten favorites",
          cardsFactory: () => trackCards(vm.forgotten),
        }),
      );
    if (vm.artists.length)
      host.append(
        shelf({
          title: "Tus artistas",
          cardsFactory: () => peopleCards(vm.artists),
          moreRoute: "people",
        }),
      );
    if (vm.albums.length)
      host.append(
        shelf({
          title: "Álbumes",
          cardsFactory: () =>
            vm.albums.map((a) =>
              makeCard({
                artwork: a.artwork,
                title: a.album,
                sub: a.artist,
                name: a.artist,
                stat: `${a.plays}x · ${formatDuration(a.seconds)}`,
                badge: a.seconds > 0 ? formatClock(a.seconds) : "",
              }),
            ),
        }),
      );
  } else {
    const recent = dedupeSessions(vm.recent).slice(0, 12);
    if (recent.length)
      host.append(
        shelf({
          eyebrow: "Tu recap",
          title: "Seguir viendo",
          cardsFactory: () => sessionCards(recent, true),
          moreRoute: "explore",
        }),
      );
    if (vm.top.length)
      host.append(
        shelf({
          title: "Top del período",
          cardsFactory: () => trackCards(vm.top, true),
        }),
      );
    if (vm.channels.length)
      host.append(
        shelf({
          title: "Tus canales",
          cardsFactory: () => peopleCards(vm.channels),
          moreRoute: "people",
        }),
      );
    if (vm.shorts.length)
      host.append(
        shelf({
          title: "Shorts",
          cardsFactory: () =>
            sessionCards(dedupeSessions(vm.shorts).slice(0, 12)),
        }),
      );
    if (vm.lives.length)
      host.append(
        shelf({
          title: "Directos",
          cardsFactory: () =>
            sessionCards(dedupeSessions(vm.lives).slice(0, 12), true),
        }),
      );
  }
  const mc = monthCards(vm.months);
  if (mc.length)
    host.append(
      shelf({
        title: "Recaps por mes",
        cardsFactory: () => mc,
        moreRoute: "calendar",
      }),
    );
  if (vm.recentSearches.length)
    host.append(
      shelf({
        title: "Búsquedas recientes",
        cardsFactory: () =>
          vm.recentSearches.map((s) =>
            makeCard({
              title: s.query,
              sub: s.source === "yt_music" ? "YT Music" : "YouTube",
              stat: relativeTime(s.timestamp),
              href: s.url,
            }),
          ),
      }),
    );
}

// ---------- EXPLORAR ----------
function renderExplore() {
  const plays = periodPlays(),
    vm = vmActivity(),
    ins = vmInsights(),
    sum = ins.sum,
    micro = vmMicro();
  const host = els.routes.explore;
  host.replaceChildren();
  const noPrevNote = ins.hasPrev ? null : "primer período con datos";
  host.append(
    pageHero({
      eyebrow: `${scopeName()} · ${periodLabel()}`,
      title: "Explorar",
      desc: sum.empty
        ? "Sin reproducciones en este período."
        : `${sum.totalPlays} reproducciones de ${sum.unique} títulos distintos. Tu momento más fuerte: ${sum.peakLabel}.`,
      visual: heroVisualExplore(),
      actions: [
        primaryBtn("Playlist del período", "play", () =>
          playIds(
            sum.empty ? [] : sum.topTracks.map((t) => t.videoId),
            "este período",
          ),
        ),
        ghostBtn("Ver calendario", "calendar", () =>
          navigate(state.scope, "calendar"),
        ),
      ],
    }),
  );
  host.append(
    kpiStrip([
      kpiCard({
        key: "seconds",
        iconName: "clock",
        label: "Tiempo total",
        value: sum.empty ? "0 min" : formatDuration(sum.totalSeconds),
        delta: ins.deltas?.seconds ?? null,
        note: noPrevNote,
        countTo: sum.empty ? 0 : sum.totalSeconds,
        fmt: formatDuration,
        micro: (() => {
          const d = el("div");
          d.innerHTML = sparkArea(ins.trend, { w: 160, h: 30, id: "k1" });
          return d.firstChild;
        })(),
      }),
      kpiCard({
        key: "plays",
        iconName: "playCircle",
        label: "Reproducciones",
        value: String(sum.empty ? 0 : sum.totalPlays),
        delta: ins.deltas?.plays ?? null,
        note: noPrevNote,
        countTo: sum.empty ? 0 : sum.totalPlays,
        fmt: String,
        micro: microBars(micro.days7.map((d) => d.plays)),
      }),
      kpiCard({
        key: "unique",
        iconName: "hash",
        label: "Títulos únicos",
        value: String(sum.empty ? 0 : sum.unique),
        delta: ins.deltas?.unique ?? null,
        note: noPrevNote,
        countTo: sum.empty ? 0 : sum.unique,
        fmt: String,
        micro: microRing(micro.uniqueRatio),
      }),
      kpiCard({
        key: "loops",
        iconName: "loop",
        label: "Bucles",
        value: String(sum.empty ? 0 : sum.totalLoops),
        note: `${Math.round(micro.loopsRatio * 100)}% del total`,
        countTo: sum.empty ? 0 : sum.totalLoops,
        fmt: String,
        micro: microRatio(micro.loopsRatio),
      }),
      kpiCard({
        key: "streak",
        iconName: "flame",
        label: "Racha actual",
        value: `${sum.empty ? 0 : sum.streak} días`,
        note: "últimos 7 días",
        micro: microDots(micro.days7),
      }),
      kpiCard({
        key: "peak",
        iconName: "peak",
        label: "Hora pico",
        value: sum.empty ? "—" : sum.peakLabel,
        note: "tu horario más fuerte",
        micro: microTicks(micro.hours),
      }),
    ]),
  );
  const grid = el("div", "route-grid");
  const hourLabels = Array.from({ length: 24 }, (_, i) =>
    [0, 6, 12, 18, 23].includes(i) ? `${String(i).padStart(2, "0")}h` : "",
  );
  const hourFull = Array.from(
    { length: 24 },
    (_, i) => `${String(i).padStart(2, "0")}:00`,
  );
  const modeRow = pillRow(
    [
      { value: "bars", label: "Barras", icon: "chart" },
      { value: "area", label: "Área", icon: "area" },
    ],
    state.hoursMode,
    (v) => {
      state.hoursMode = v;
      localStorage.setItem("recapHoursMode", v);
      setPills(modeRow, v);
      state.sigs = computeSigs();
      renderExplore();
      hydrateShelves();
    },
    "Modo del gráfico",
  );
  const dayTools = [modeRow];
  if (ins.hasPrev)
    dayTools.push(
      tinyToggle("Anterior", "compare", state.showGhost, () => {
        state.showGhost = !state.showGhost;
        localStorage.setItem("recapGhost", state.showGhost ? "1" : "0");
        state.sigs = computeSigs();
        renderExplore();
        hydrateShelves();
      }),
    );
  if (state.hourFilter != null)
    dayTools.push(
      ghostBtn("Quitar filtro", "close", () => {
        state.hourFilter = null;
        state.sigs = computeSigs();
        renderExplore();
        hydrateShelves();
      }),
    );
  const dayChart = barChart({
    values: vm.hours,
    prev: vmPrevHours(),
    labels: hourLabels,
    fullLabels: hourFull,
    mode: state.hoursMode,
    ghost: state.showGhost && ins.hasPrev,
    selected: state.hourFilter,
    night: (i) => i < 6,
    noun: "de escucha",
    onPick: (h) => {
      state.hourFilter = state.hourFilter === h ? null : h;
      state.sigs = computeSigs();
      renderExplore();
      hydrateShelves();
    },
  });
  const dayBody = el("div");
  dayBody.append(dayChart);
  const legend = el("div", "hx-legend");
  const lg = (color, label) => {
    const s = el("span");
    const i = el("i");
    i.style.background = color;
    s.append(i, label);
    return s;
  };
  legend.append(
    lg("var(--data-lo)", "este período"),
    lg("var(--annotate)", "pico"),
    lg("var(--compare)", "promedio / anterior"),
    lg("rgba(255,255,255,.2)", "madrugada"),
  );
  dayBody.append(legend);
  grid.append(
    panel({
      iconName: "clock",
      title: "Tu día",
      sub: "clic en una barra para ver ese horario",
      span: 8,
      tools: dayTools,
      body: dayBody,
    }),
  );
  const wdSec = new Array(7).fill(0),
    wdPlays = new Array(7).fill(0);
  for (const p of plays) {
    const idx = (new Date(p.timestamp).getDay() + 6) % 7;
    wdSec[idx] += p.seconds || 0;
    wdPlays[idx] += 1;
  }
  const wdFull = [
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
    "Domingo",
  ];
  const weekChart = barChart({
    values: wdSec,
    labels: ["L", "M", "X", "J", "V", "S", "D"],
    fullLabels: wdFull,
    onPick: null,
    noun: "de escucha",
  });
  grid.append(
    panel({
      iconName: "calendar",
      title: "Tu semana",
      sub: "lunes a domingo",
      span: 4,
      body: weekChart,
    }),
  );
  grid.append(
    panel({
      iconName: "disc",
      title: "Formatos",
      sub: "sobre el total del período",
      span: 4,
      body: donutChart(vmFormats()),
    }),
  );
  const catBody = el("div");
  if (vm.catEntries.length) {
    const bars = el("div", "cat-bars");
    bars.append(
      ...vm.catEntries.map((st) => {
        const row = el("div", "cat-row");
        const top = el("div", "cat-row-top");
        top.append(
          el("span", null, translateCategory(st.cat)),
          el(
            "span",
            null,
            `${st.pct}% · ${st.plays}x (${formatDuration(st.seconds)})`,
          ),
        );
        const track = el("div", "cat-track");
        const fill = el("div", "cat-fill");
        fill.style.width = `${st.pct}%`;
        track.append(fill);
        tipify(
          track,
          () =>
            `${translateCategory(st.cat)} · ${st.pct}% · ${formatDuration(st.seconds)}`,
        );
        row.append(top, track);
        return row;
      }),
    );
    catBody.append(bars);
  } else
    catBody.append(
      emptyState("disc", "Sin categorías registradas en este período."),
    );
  const chips = el("div", "stat-chips");
  const chip = (iconName, label, value) => {
    const c = el("div", "stat-chip");
    const i = el("span");
    i.innerHTML = icon(iconName, 14);
    c.append(i, el("span", null, label), el("strong", null, String(value)));
    return c;
  };
  chips.append(
    chip("heart", "Me gusta", vm.likesCount),
    chip("bell", "Suscripciones", vm.subsCount),
    chip("search", "Búsquedas", vm.searchesCount),
    chip("queue", "Mix / Playlist", vm.mixCount),
    chip("bolt", "Vel. promedio", vm.avgRate),
    chip(
      "music",
      "Música en YouTube",
      vm.chips.find((c) => c[0] === "Música en YouTube")?.[1] ?? 0,
    ),
  );
  chips.style.marginTop = "14px";
  catBody.append(chips);
  grid.append(
    panel({
      iconName: "grid",
      title: "Categorías e interacciones",
      span: 8,
      body: catBody,
    }),
  );
  grid.append(insightsPanel(vmNarrative()));
  if (state.hourFilter != null) {
    const hourPlays = plays
      .filter((p) => new Date(p.timestamp).getHours() === state.hourFilter)
      .sort((a, b) => b.timestamp - a.timestamp);
    const body = el("div");
    if (!hourPlays.length)
      body.append(
        emptyState("clock", "Nada en ese horario dentro del período."),
      );
    else {
      const list = el("div", "pt");
      hourPlays.slice(0, 20).forEach((p, i) =>
        list.append(
          rankRow({
            rank: i + 1,
            thumb: p.artwork,
            name: p.title,
            sub: `${p.artist} · ${formatTimeEs(p.timestamp)}`,
            tag: formatTag(p),
            value: formatClock(p.seconds || 0),
            href: resolveVideoUrl(p),
          }),
        ),
      );
      body.append(list);
    }
    grid.append(
      panel({
        iconName: "target",
        title: `Reproducciones de las ${String(state.hourFilter).padStart(2, "0")}:00`,
        sub: `${hourPlays.length} en el período`,
        span: 12,
        body,
      }),
    );
  }
  host.append(grid);
  if (!sum.empty) {
    host.append(
      shelf({
        title: "Top del período",
        cardsFactory: () =>
          trackCards(sum.topTracks.slice(0, 12), !isMusicScope()),
        moreRoute: "people",
      }),
    );
    const dir = vmDirectory().list.slice(0, 12);
    if (dir.length)
      host.append(
        shelf({
          title: isMusicScope() ? "Artistas destacados" : "Canales destacados",
          cardsFactory: () => peopleCards(dir),
          moreRoute: "people",
        }),
      );
    if (isMusicScope() && vm.topAlbums.length)
      host.append(
        shelf({
          title: "Álbumes",
          cardsFactory: () =>
            vm.topAlbums.map((a) =>
              makeCard({
                artwork: a.artwork,
                title: a.album,
                sub: a.artist,
                name: a.artist,
                stat: `${a.plays}x · ${formatDuration(a.seconds)}`,
              }),
            ),
        }),
      );
    if (vm.topSearches.length)
      host.append(
        shelf({
          title: "Búsquedas top",
          cardsFactory: () =>
            vm.topSearches.map((s) =>
              makeCard({
                title: s.query,
                sub: s.source === "yt_music" ? "YT Music" : "YouTube",
                stat: `${s.count} veces`,
                href: s.url,
              }),
            ),
        }),
      );
    if (vm.topSkips.length)
      host.append(
        shelf({
          title: "Más salteadas",
          cardsFactory: () =>
            vm.topSkips.map((s) =>
              makeCard({
                artwork: s.artwork,
                title: s.title,
                sub: s.artist,
                name: s.artist,
                stat: `${s.count} skips`,
                href: s.videoUrl,
              }),
            ),
        }),
      );
  }
}

// ---------- CALENDARIO ----------
function renderCalendarRoute() {
  const hero = vmCalHero();
  els.calHero.replaceChildren();
  const rec = hero.recordDay;
  els.calHero.append(
    pageHero({
      eyebrow: `${scopeName()} · ${calUi.calYear}`,
      title: "Tu calendario",
      desc:
        hero.yearPlays > 0
          ? `${hero.activeDays} días con actividad en ${calUi.calYear}${hero.bestMonth ? ` · mejor mes: ${hero.bestMonth.label} (${formatDuration(hero.bestMonth.seconds)})` : ""}.`
          : `Sin actividad registrada en ${calUi.calYear}.`,
      visual: heroVisualCalendar(),
      actions: hero.bestMonth
        ? [
            ghostBtn(`Ir a ${hero.bestMonth.label}`, "trophy", () => {
              calUi.calMonth = hero.bestMonth.index;
              calUi.calViewMode = "month";
              calUi.selectedDateKey = toDateKey(
                new Date(calUi.calYear, hero.bestMonth.index, 1),
              );
              calUi.calRangeAnchor = null;
              calUi.calRangeEnd = null;
              calUi.calWeekOpen = null;
              syncCalModeButtons();
              state.sigs = computeSigs();
              renderCalendarRoute();
            }),
          ]
        : [],
      insight: rec
        ? {
            icon: "trophy",
            text: `Tu día más fuerte de ${calUi.calYear} fue <strong>${rec.label}</strong> con <strong>${formatDuration(rec.seconds)}</strong>. Racha máxima: <strong>${hero.maxStreak} días</strong>.`,
          }
        : hero.maxStreak > 0
          ? {
              icon: "flame",
              text: `Tu racha más larga de ${calUi.calYear} fue de <strong>${hero.maxStreak} días</strong> seguidos con actividad.`,
            }
          : null,
      kpis: [
        kpiCard({
          iconName: "clock",
          label: `Total ${calUi.calYear}`,
          value: formatDuration(hero.yearSeconds),
        }),
        kpiCard({
          iconName: "playCircle",
          label: "Reproducciones",
          value: String(hero.yearPlays),
        }),
        kpiCard({
          iconName: "calendarCheck",
          label: "Días activos",
          value: String(hero.activeDays),
        }),
        kpiCard({
          iconName: "flame",
          label: "Racha máxima",
          value: `${hero.maxStreak} días`,
        }),
      ],
    }),
  );
  renderCalendarView({
    dom: domCal,
    uiState: calUi,
    variant: "full",
    getFilteredPlays: (cd) =>
      store.history.filter((it) => matchesFilter(it, "all", scopeValue(), cd)),
    getFilteredMeta: (items, cd) =>
      items.filter((it) =>
        matchesPeriodAndSourceOnly(it, "all", scopeValue(), cd),
      ),
    store,
    buildTrackRow,
    renderInteractionRow,
    renderSearchRow,
    onExportPng: (cardData, btn) => exportPngCard(cardData, btn),
  });
}
function syncCalModeButtons() {
  document
    .querySelectorAll(".cal-mode-btn[data-calview]")
    .forEach((b) =>
      b.classList.toggle("active", b.dataset.calview === calUi.calViewMode),
    );
}

// ---------- PERSONAS ----------
function renderPeople() {
  const host = els.routes.people;
  host.replaceChildren();
  if (state.detail) {
    renderPersonDetail(host, state.detail);
    return;
  }
  const dir = vmDirectory(),
    music = isMusicScope();
  const totalSec = dir.totals.seconds || 0;
  const topShare =
    totalSec > 0 && dir.list[0]
      ? Math.round((dir.list[0].seconds / totalSec) * 100)
      : 0;
  const kpis = music
    ? [
        kpiCard({
          iconName: "mic",
          label: "Artistas",
          value: String(dir.totals.count),
        }),
        kpiCard({
          key: "dirSeconds",
          iconName: "clock",
          label: "Tiempo escuchado",
          value: formatDuration(totalSec),
        }),
        kpiCard({
          key: "dirPlays",
          iconName: "playCircle",
          label: "Reproducciones",
          value: String(dir.totals.plays),
        }),
        kpiCard({
          iconName: "trophy",
          label: "Top artista",
          value: dir.list[0]?.name || "—",
        }),
      ]
    : [
        kpiCard({
          iconName: "people",
          label: "Canales",
          value: String(dir.totals.count),
        }),
        kpiCard({
          key: "dirSeconds",
          iconName: "clock",
          label: "Tiempo reproducido",
          value: formatDuration(totalSec),
        }),
        kpiCard({
          iconName: "eye",
          label: "Visitas",
          value: String(dir.totals.visits),
        }),
        kpiCard({
          iconName: "playCircle",
          label: "Con tiempo",
          value: String(dir.totals.withTime),
        }),
      ];
  host.append(
    pageHero({
      eyebrow: `${scopeName()} · ${periodLabel()}`,
      title: music ? "Tus artistas" : "Tus canales",
      desc: music
        ? "Ordená por tiempo, reproducciones o nombre. Tocá una card para ver su detalle."
        : "Ordená por tiempo, visitas o reproducciones y filtrá por duración mínima.",
      visual: heroVisualPeople(dir.list),
      actions: [
        primaryBtn("Playlist de los top", "play", () =>
          playIds(
            aggregateTracks(periodPlays()).map((t) => t.videoId),
            "tus top",
          ),
        ),
      ],
      insight:
        topShare >= 15
          ? {
              icon: "target",
              text: `El <strong>${topShare}%</strong> de tu tiempo es de <strong>${dir.list[0].name}</strong>.`,
            }
          : null,
      kpis,
    }),
  );
  const sortItems = music
    ? [
        { value: "time", label: "Tiempo", icon: "clock" },
        { value: "plays", label: "Reproducciones", icon: "playCircle" },
        { value: "name", label: "Nombre", icon: "list" },
      ]
    : [
        { value: "time", label: "Tiempo", icon: "clock" },
        { value: "visits", label: "Visitas", icon: "eye" },
        { value: "plays", label: "Reproducciones", icon: "playCircle" },
      ];
  const sortRow = pillRow(
    sortItems,
    state.peopleSort,
    (v) => {
      state.peopleSort = v;
      localStorage.setItem("recapPeopleSort", v);
      setPills(sortRow, v);
      state.sigs = computeSigs();
      refreshDirectory();
    },
    "Ordenar",
  );
  const tools = [sortRow];
  if (!music) {
    const minItems = [
      { value: 0, label: "Todos" },
      { value: 1, label: "> 0m" },
      { value: 900, label: "+15m" },
      { value: 3600, label: "+1h" },
    ];
    const minRow = pillRow(
      minItems,
      state.peopleMinSec,
      (v) => {
        state.peopleMinSec = v;
        localStorage.setItem("recapPeopleMin", String(v));
        setPills(minRow, v);
        state.sigs = computeSigs();
        refreshDirectory();
      },
      "Duración mínima",
    );
    tools.push(minRow);
  }
  const search = el("input", "mini-search");
  search.type = "search";
  search.placeholder = music ? "Filtrar artistas…" : "Filtrar canales…";
  search.value = state.peopleQuery;
  search.setAttribute(
    "aria-label",
    music ? "Filtrar artistas" : "Filtrar canales",
  );
  search.addEventListener("input", () => {
    if (dirTimer) clearTimeout(dirTimer);
    dirTimer = setTimeout(() => {
      state.peopleQuery = search.value;
      state.sigs = computeSigs();
      refreshDirectory();
    }, 180);
  });
  tools.push(search);
  const dirPanel = panel({
    iconName: music ? "mic" : "people",
    title: music ? "Directorio de artistas" : "Directorio de canales",
    span: 12,
    tools,
  });
  const dirBody = el("div");
  dirBody.id = "peopleDirectory";
  dirPanel._body.append(dirBody);
  host.append(dirPanel);
  const rankPanel = panel({
    iconName: "chart",
    title: "Ranking",
    sub: "por tiempo reproducido",
    span: 12,
  });
  rankPanel._body.id = "peopleRanking";
  host.append(rankPanel);
  if (!music) {
    const recentPanel = panel({
      iconName: "eye",
      title: "Últimas visitas a canales",
      span: 12,
    });
    recentPanel._body.id = "peopleRecent";
    host.append(recentPanel);
  }
  refreshDirectory();
}
function refreshDirectory() {
  const dir = vmDirectory(),
    music = isMusicScope();
  const gridHost = document.getElementById("peopleDirectory");
  const rankHost = document.getElementById("peopleRanking");
  const recentHost = document.getElementById("peopleRecent");
  if (!gridHost || !rankHost) return;
  gridHost.replaceChildren();
  if (!dir.list.length) {
    gridHost.append(
      emptyState(
        music ? "mic" : "people",
        "Ningún resultado con esos filtros. Probá otro orden o limpiá la búsqueda.",
        ghostBtn("Limpiar filtros", "refresh", () => {
          state.peopleQuery = "";
          state.peopleMinSec = 0;
          localStorage.setItem("recapPeopleMin", "0");
          state.sigs = computeSigs();
          renderPeople();
          hydrateShelves();
        }),
      ),
    );
  } else {
    gridHost.append(
      directoryGrid(dir.list, (a) =>
        personTile({
          name: a.name,
          artwork: music ? a.artwork : a.avatar,
          meta:
            a.seconds > 0 ? formatDuration(a.seconds) : `${a.visits} visitas`,
          sub: music
            ? `${a.plays} rep.${a.albums ? ` · ${a.albums} álbumes` : ""}`
            : `${a.plays} rep. · ${a.visits} visitas`,
          onOpen: () => navigate(state.scope, "people", a.name),
          onPlay: () =>
            playIds(
              aggregateTracks(
                periodPlays().filter(
                  (p) =>
                    (p.artist || "").toLowerCase() === a.name.toLowerCase(),
                ),
              ).map((t) => t.videoId),
              a.name,
            ),
        }),
      ),
    );
  }
  rankHost.replaceChildren();
  const ranked = dir.list.slice(0, 25);
  if (!ranked.length)
    rankHost.append(
      emptyState("chart", "Sin datos para el ranking con estos filtros."),
    );
  else {
    const list = el("div", "pt");
    const maxSec = Math.max(1, dir.list[0]?.seconds || 1);
    ranked.forEach((a, i) =>
      list.append(
        rankRow({
          rank: i + 1,
          medal: i < 3 ? i + 1 : null,
          thumb: music ? a.artwork : a.avatar,
          round: true,
          name: a.name,
          sub: music
            ? `${a.plays} rep.${a.likes ? ` · ${a.likes} ❤` : ""}`
            : `${a.visits} visitas · ${a.plays} rep.`,
          value: a.seconds > 0 ? formatDuration(a.seconds) : `${a.visits}x`,
          pct: a.seconds > 0 ? Math.round((a.seconds / maxSec) * 100) : 0,
          onOpen: () => navigate(state.scope, "people", a.name),
        }),
      ),
    );
    rankHost.append(list);
  }
  if (recentHost) {
    recentHost.replaceChildren();
    const recent = dir.recent || [];
    if (!recent.length)
      recentHost.append(
        emptyState("eye", "Todavía no registraste visitas directas a canales."),
      );
    else {
      const list = el("div", "pt");
      recent.forEach((v, i) =>
        list.append(
          rankRow({
            rank: i + 1,
            thumb: v.avatar,
            round: true,
            name: v.name,
            sub: `${v.source === "yt_music" ? "YT Music" : "YouTube"} · ${relativeTime(v.timestamp)}`,
            value: "Abrir ↗",
            href: v.url,
          }),
        ),
      );
      recentHost.append(list);
    }
  }
}
function renderPersonDetail(host, name) {
  const music = isMusicScope();
  const detail = music
    ? memoVM(`artistDetail:${name}`, () =>
        artistDetailVM(name, allPlays(), metaAll(store.interactions)),
      )
    : memoVM(`channelDetail:${name}`, () =>
        channelDetailVM(name, allPlays(), metaAll(store.channelVisits)),
      );
  const bar = el("div", "detail-bar");
  bar.append(
    ghostBtn(
      music ? "Volver a artistas" : "Volver a canales",
      "arrowLeft",
      () => navigate(state.scope, "people"),
    ),
  );
  host.append(bar);
  if (!detail || (detail.plays === 0 && (detail.visits || 0) === 0)) {
    host.append(
      emptyState(
        "alert",
        `No encontramos actividad de «${name}» en este scope.`,
      ),
    );
    return;
  }
  const avatar = el("div", "detail-avatar");
  const art = music ? detail.artwork : detail.avatar;
  if (art) {
    const img = el("img");
    img.src = art;
    img.alt = "";
    attachImgFallback(img, detail.name);
    avatar.append(img);
  } else avatar.append(createMonogram(detail.name));
  const kpis = music
    ? [
        kpiCard({
          iconName: "clock",
          label: "Tiempo escuchado",
          value: formatDuration(detail.seconds),
        }),
        kpiCard({
          iconName: "playCircle",
          label: "Reproducciones",
          value: String(detail.plays),
        }),
        kpiCard({
          iconName: "disc",
          label: "Álbumes",
          value: String(detail.albums.length),
        }),
        kpiCard({
          iconName: "heart",
          label: "Me gusta",
          value: String(detail.likes.length),
        }),
      ]
    : [
        kpiCard({
          iconName: "clock",
          label: "Tiempo reproducido",
          value: formatDuration(detail.seconds),
        }),
        kpiCard({
          iconName: "playCircle",
          label: "Reproducciones",
          value: String(detail.plays),
        }),
        kpiCard({
          iconName: "eye",
          label: "Visitas al canal",
          value: String(detail.visits),
        }),
        kpiCard({
          iconName: "bolt",
          label: "Shorts",
          value: String(detail.shorts.length),
        }),
      ];
  host.append(
    pageHero({
      eyebrow: music ? "Artista" : "Canal",
      title: detail.name,
      desc: `Historial completo de ${scopeName()} · última actividad ${relativeTime(detail.lastTs || detail.recentVisits?.[0]?.timestamp || Date.now())}.`,
      cover: avatar,
      actions: [
        primaryBtn("Playlist de sus top", "play", () =>
          playIds(detail.ids, detail.name),
        ),
        detail.url
          ? ghostBtn("Abrir en YouTube", "jump", () => openUrl(detail.url))
          : null,
      ].filter(Boolean),
      kpis,
    }),
  );
  if (detail.topTracks.length) {
    const p = panel({
      iconName: "playCircle",
      title: "Top temas / videos",
      sub: `${detail.topTracks.length} títulos`,
      span: 12,
    });
    p._body.append(trackTable(detail.topTracks, { showBar: true }));
    host.append(p);
  }
  if (music && detail.albums.length)
    host.append(
      shelf({
        title: "Álbumes",
        cardsFactory: () =>
          detail.albums.map((a) =>
            makeCard({
              artwork: a.artwork,
              title: a.album,
              sub: a.artist,
              name: a.artist,
              stat: `${a.plays}x · ${formatDuration(a.seconds)}`,
            }),
          ),
      }),
    );
  if (!music && detail.shorts.length)
    host.append(
      shelf({
        title: "Shorts",
        cardsFactory: () => sessionCards(detail.shorts),
      }),
    );
  if (!music && detail.lives.length)
    host.append(
      shelf({
        title: "Directos",
        cardsFactory: () => sessionCards(detail.lives, true),
      }),
    );
  if (music && detail.months.length)
    host.append(
      shelf({
        title: "Meses con este artista",
        cardsFactory: () => monthCards(detail.months),
      }),
    );
  if (music && detail.likes.length) {
    const p = panel({
      iconName: "heart",
      title: "Me gusta de este artista",
      span: 12,
    });
    const list = el("div", "pt");
    detail.likes.slice(0, 20).forEach((it, i) =>
      list.append(
        rankRow({
          rank: i + 1,
          thumb: it.artwork,
          name: it.title,
          sub: `${translateCategory(it.category) || "Sin categoría"} · ${relativeTime(it.timestamp)}`,
          value: "Abrir ↗",
          href: it.videoUrl,
        }),
      ),
    );
    p._body.append(list);
    host.append(p);
  }
  if (!music && detail.recentVisits.length) {
    const p = panel({ iconName: "eye", title: "Visitas al canal", span: 12 });
    const list = el("div", "pt");
    detail.recentVisits.forEach((v, i) =>
      list.append(
        rankRow({
          rank: i + 1,
          thumb: v.avatar,
          round: true,
          name: detail.name,
          sub: relativeTime(v.timestamp),
          value: "Abrir ↗",
          href: v.url,
        }),
      ),
    );
    p._body.append(list);
    host.append(p);
  }
}

// ---------- LIKES ----------
function renderLikes() {
  const vm = vmLikesPage();
  const host = els.routes.likes;
  host.replaceChildren();
  const cover = el("div", "hero-cover");
  if (vm.collage.length >= 4) {
    for (const src of vm.collage.slice(0, 4)) {
      const img = el("img");
      img.src = src;
      img.alt = "";
      img.loading = "lazy";
      attachImgFallback(img, "Liked");
      cover.append(img);
    }
  } else {
    const solo = el("span", "cover-solo");
    solo.innerHTML = icon("heartFill", 48);
    cover.append(solo);
  }
  const oldestDays = vm.oldest
    ? Math.floor((Date.now() - vm.oldest) / 86400000)
    : null;
  host.append(
    pageHero({
      eyebrow: `${scopeName()} · ${periodLabel()}`,
      title: isMusicScope() ? "Liked Music" : "Me gusta (videos)",
      desc: `${vm.totals.likes} me gusta · ${formatDuration(vm.totals.seconds)} escuchados de esos temas · ${vm.totals.subs} suscripciones nuevas.`,
      cover,
      actions: [
        primaryBtn("Reproducir todo", "play", () =>
          playIds(vm.ids, "tus me gusta"),
        ),
        ghostBtn("Ver artistas/canales", "people", () =>
          navigate(state.scope, "people"),
        ),
      ],
      insight:
        oldestDays != null
          ? {
              icon: "clock",
              text: `Tu like más viejo del período tiene <strong>${oldestDays} ${oldestDays === 1 ? "día" : "días"}</strong>.`,
            }
          : null,
      kpis: [
        kpiCard({
          iconName: "heart",
          label: "Me gusta",
          value: String(vm.totals.likes),
        }),
        kpiCard({
          key: "likedSeconds",
          iconName: "clock",
          label: "Tiempo de esos temas",
          value: formatDuration(vm.totals.seconds),
        }),
        kpiCard({
          iconName: "bell",
          label: "Suscripciones",
          value: String(vm.totals.subs),
        }),
        kpiCard({
          iconName: "search",
          label: "Búsquedas únicas",
          value: String(vm.totals.groups),
        }),
      ],
    }),
  );
  const tabs = [
    { value: "likes", label: `Me gusta (${vm.totals.likes})`, icon: "heart" },
    { value: "subs", label: `Suscripciones (${vm.totals.subs})`, icon: "bell" },
    {
      value: "searches",
      label: `Búsquedas (${vm.totals.groups})`,
      icon: "search",
    },
  ];
  const tabRow = pillRow(
    tabs,
    state.likesTab,
    (v) => {
      state.likesTab = v;
      localStorage.setItem("recapLikesTab", v);
      setPills(tabRow, v);
      paintLikesBody();
    },
    "Secciones de likes",
  );
  host.append(tabRow);
  const body = el("div");
  body.id = "likesBody";
  host.append(body);
  paintLikesBody();
}
function paintLikesBody() {
  const vm = vmLikesPage();
  const body = document.getElementById("likesBody");
  if (!body) return;
  body.replaceChildren();
  if (state.likesTab === "likes") {
    const grid = el("div", "route-grid");
    const main = panel({
      iconName: "heart",
      title: "Temas con Me gusta",
      sub: `${vm.likes.length} en el período`,
      span: 8,
    });
    if (!vm.likes.length)
      main._body.append(
        emptyState(
          "heart",
          "Todavía no diste Me gusta en este período. Dale like a un tema en YouTube o YT Music y aparece acá.",
        ),
      );
    else {
      const list = el("div", "pt");
      vm.likes.forEach((it, i) =>
        list.append(
          rankRow({
            rank: i + 1,
            medal: i < 3 ? i + 1 : null,
            thumb: it.artwork,
            name: it.title,
            sub: `${it.artist} · ${relativeTime(it.timestamp)}`,
            tag:
              translateCategory(it.category) ||
              (it.source === "yt_music" ? "YT Music" : ""),
            value: "Abrir ↗",
            href: it.videoUrl,
          }),
        ),
      );
      main._body.append(list);
    }
    grid.append(main);
    const rail = panel({
      iconName: "bell",
      title: "Suscripciones nuevas",
      sub: `${vm.subs.length}`,
      span: 4,
    });
    if (!vm.subs.length)
      rail._body.append(
        emptyState("bell", "Sin suscripciones nuevas en este período."),
      );
    else {
      const list = el("div", "pt");
      vm.subs.slice(0, 8).forEach((it, i) =>
        list.append(
          rankRow({
            rank: i + 1,
            thumb: it.artwork,
            round: true,
            name: it.title,
            sub: relativeTime(it.timestamp),
            value: "Canal ↗",
            href: it.channelUrl,
          }),
        ),
      );
      rail._body.append(list);
    }
    grid.append(rail);
    body.append(grid);
    return;
  }
  if (state.likesTab === "subs") {
    const p = panel({
      iconName: "bell",
      title: "Canales a los que te suscribiste",
      sub: `${vm.subs.length} en el período`,
      span: 12,
    });
    if (!vm.subs.length)
      p._body.append(
        emptyState(
          "bell",
          "Todavía no registraste suscripciones nuevas en este período.",
        ),
      );
    else
      p._body.append(
        directoryGrid(vm.subs, (it) =>
          personTile({
            name: it.title,
            artwork: it.artwork,
            meta: relativeTime(it.timestamp),
            sub: it.source === "yt_music" ? "YT Music" : "YouTube",
            onOpen: () => openUrl(it.channelUrl),
          }),
        ),
      );
    body.append(p);
    return;
  }
  const p = panel({
    iconName: "search",
    title: "Búsquedas agrupadas",
    sub: `${vm.totals.groups} únicas · ${vm.totals.searches} eventos`,
    span: 12,
  });
  if (!vm.searchGroups.length)
    p._body.append(
      emptyState("search", "Sin búsquedas registradas en este período."),
    );
  else {
    const grid = el("div", "query-grid");
    for (const g of vm.searchGroups) {
      const card = el("button", "query-card");
      card.type = "button";
      const ico = el("span", "query-ico");
      ico.innerHTML = icon("search", 16);
      const m = el("div", "query-meta");
      m.append(
        el("div", "query-text", g.query),
        el(
          "div",
          "query-sub",
          `${g.source === "yt_music" ? "YT Music" : "YouTube"} · ${relativeTime(g.lastTs)}`,
        ),
      );
      card.append(ico, m, el("span", "query-count", `×${g.count}`));
      card.title = `Repetir búsqueda: ${g.query}`;
      card.addEventListener("click", () => openUrl(g.url));
      grid.append(card);
    }
    p._body.append(grid);
  }
  body.append(p);
}

// ---------- RESULTADOS ----------
function renderResults() {
  const host = els.routes.results;
  host.replaceChildren();
  const vm = searchVM(state.q, scopeValue(), store);
  const h = el(
    "h2",
    "route-title",
    state.q ? `Resultados para «${state.q}»` : "Resultados",
  );
  h.tabIndex = -1;
  host.append(h);
  if (!vm) {
    host.append(
      emptyState("search", "Escribí algo en el buscador para ver resultados."),
    );
    return;
  }
  const total =
    vm.tracks.length +
    vm.artists.length +
    vm.channels.length +
    vm.searches.length;
  if (!total) {
    host.append(
      emptyState(
        "search",
        `Sin resultados para «${state.q}» en ${scopeName()}.`,
      ),
    );
    return;
  }
  if (vm.tracks.length)
    host.append(
      shelf({
        title: "Temas y videos",
        cardsFactory: () => trackCards(vm.tracks, !isMusicScope()),
      }),
    );
  if (vm.artists.length)
    host.append(
      shelf({
        title: "Artistas / canales",
        cardsFactory: () => peopleCards(vm.artists),
      }),
    );
  if (vm.channels.length)
    host.append(
      shelf({
        title: "Canales visitados",
        cardsFactory: () =>
          vm.channels.map((v) =>
            makeCard({
              kind: "round",
              artwork: v.avatar,
              title: v.name,
              sub: relativeTime(v.timestamp),
              href: v.url,
            }),
          ),
      }),
    );
  if (vm.searches.length)
    host.append(
      shelf({
        title: "Búsquedas",
        cardsFactory: () =>
          vm.searches.map((s) =>
            makeCard({
              title: s.query,
              sub: s.source === "yt_music" ? "YT Music" : "YouTube",
              stat: relativeTime(s.timestamp),
              href: s.url,
            }),
          ),
      }),
    );
}

// ---------- render root ----------
function markEntrance(host) {
  [...host.children].forEach((n, i) => {
    n.classList.add("enter");
    n.style.setProperty("--i", String(Math.min(i, 8)));
  });
}
function renderRoute() {
  cancelCountUps();
  for (const io of observers) io.disconnect();
  observers.clear();
  mountedRows.clear();
  pendingShelves.length = 0;
  hideTip();
  const savedTop = els.content.scrollTop;
  const animate = state.animateNext;
  state.animateNext = false;
  ANIM = animate && !reduceMotion();
  for (const [key, node] of Object.entries(els.routes))
    node.hidden = key !== state.route;
  switch (state.route) {
    case "home":
      renderHome();
      break;
    case "explore":
      renderExplore();
      break;
    case "calendar":
      renderCalendarRoute();
      break;
    case "people":
      renderPeople();
      break;
    case "likes":
      renderLikes();
      break;
    case "results":
      renderResults();
      break;
  }
  hydrateShelves();
  if (animate && !reduceMotion()) markEntrance(els.routes[state.route]);
  ANIM = false;
  els.content.scrollTop = savedTop;
  if (
    state.lastRoute !== state.route ||
    state.lastScope !== state.scope ||
    state.lastDetail !== state.detail
  ) {
    els.content.scrollTop = 0;
    const heading = els.routes[state.route].querySelector(".route-title");
    if (heading) heading.focus({ preventScroll: true });
    state.lastRoute = state.route;
    state.lastScope = state.scope;
    state.lastDetail = state.detail;
  }
}
function renderAll() {
  state.sigs = computeSigs();
  if (state.lastScope != null && state.lastScope !== state.scope) {
    els.mainCol.classList.remove("scope-enter");
    void els.mainCol.offsetWidth;
    els.mainCol.classList.add("scope-enter");
  }
  renderShell();
  renderRoute();
  renderPlayer();
  updateAmbient();
}
function refreshData() {
  if (document.hidden) return;
  const sigs = computeSigs(),
    prev = state.sigs;
  state.sigs = sigs;
  if (!prev || prev.struct !== sigs.struct) {
    const top = els.content.scrollTop;
    renderShell();
    renderRoute();
    els.content.scrollTop = top;
    updateAmbient();
  } else if (prev.metrics !== sigs.metrics) updateMetricsInPlace();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    refreshData();
    renderPlayer();
  }
});

// ---------- playerbar + now playing ----------
function renderPlayer() {
  const sel = npService.select(state.pinnedNpTabId);
  const np = sel?.primary || null;
  state.currentNp = np;
  state.currentTabId = np?.tabId ?? null;

  const updateSeek = () => {
    if (!np) {
      els.pbSeek.value = 0;
      els.pbSeek.style.setProperty("--pb-fill", "0%");
      els.pbTime.textContent = "0:00";
      if (els.pbTimeTotal) els.pbTimeTotal.textContent = "0:00";
      return;
    }
    if (!state.seeking) {
      const vol = Math.round((np.muted ? 0 : (np.volume ?? 1)) * 100);
      els.pbVol.value = vol;
      els.pbVol.style.setProperty("--pb-vol", `${vol}%`);
      els.pbVol.setAttribute("aria-valuetext", `${vol}%`);
      const pct = np.duration > 0 ? np.currentTime / np.duration : 0;
      els.pbSeek.value = Math.round(pct * 1000);
      els.pbSeek.style.setProperty("--pb-fill", `${(pct * 100).toFixed(2)}%`);
      els.pbSeek.setAttribute(
        "aria-valuetext",
        np.duration > 0
          ? `${formatClock(np.currentTime)} de ${formatClock(np.duration)}`
          : formatClock(np.currentTime),
      );
    }
    els.pbTime.textContent = formatClock(np.currentTime);
    if (els.pbTimeTotal)
      els.pbTimeTotal.textContent =
        np.duration > 0 ? formatClock(np.duration) : "0:00";
  };

  if (!np) {
    if (lastPlayerSig !== "none") {
      lastPlayerSig = "none";
      els.pbTitle.textContent = "Nada reproduciéndose ahora";
      els.pbArtist.textContent = "Abrí YouTube o YT Music en otra pestaña";
      els.pbThumb.removeAttribute("src");
      els.pbSource.hidden = true;
      els.pbLoopBadge.hidden = true;
      els.pbPinned.hidden = true;
      els.pbStale.hidden = true;
      els.pbPlay.innerHTML = icon("play", 18);
      els.pbLike.innerHTML = icon("heart", 18);
      els.pbLike.classList.remove("on");
      els.npArt.removeAttribute("src");
      els.npTitle.textContent = "Nada reproduciéndose";
      els.npArtist.textContent = "Abrí YouTube o YT Music";
      els.npSource.textContent = "—";
      els.npLoopBadge.hidden = true;
      els.npPinned.hidden = true;
      els.npStale.hidden = true;
      els.npPlay.innerHTML = icon("play", 22);
      els.npLike.innerHTML = icon("heart", 18);
      els.npLike.classList.remove("on");
      els.npMeta.replaceChildren();
      els.npCount.textContent = "";
      els.npCount.classList.remove("saved");
    }
    updateSeek();
    renderQueue([]);
    return;
  }

  const stale = !np.paused && Date.now() - np.updatedAt > 90000;
  const sig = [
    np.storageKey || np.tabId,
    np.paused,
    np.muted,
    np.loopActive,
    np.liked,
    np.title,
    np.artist,
    np.album,
    np.artwork,
    np.source,
    np.isMusic,
    np.category,
    np.contentType,
    np.context,
    np.playbackRate,
    state.pinnedNpTabId,
    np.sessionSeconds,
    np.minRequired,
    np.isLoopSession,
    stale,
  ].join("|");

  if (sig !== lastPlayerSig) {
    lastPlayerSig = sig;
    if (np.artwork) {
      els.pbThumb.src = np.artwork;
      els.npArt.src = np.artwork;
    } else {
      els.pbThumb.removeAttribute("src");
      els.npArt.removeAttribute("src");
    }
    els.pbTitle.textContent = np.title;
    els.pbArtist.textContent = np.album
      ? `${np.artist} · ${np.album}`
      : np.artist;
    els.npTitle.textContent = np.title;
    els.npArtist.textContent = np.album
      ? `${np.artist} · ${np.album}`
      : np.artist;
    const srcLabel =
      np.source === "yt_music"
        ? "YT Music"
        : np.isMusic
          ? "YouTube · Música"
          : "YouTube";
    els.pbSource.hidden = false;
    els.pbSource.textContent = srcLabel;
    els.npSource.textContent = srcLabel;
    els.pbLoopBadge.hidden = !(np.loopActive || np.isLoopSession);
    els.npLoopBadge.hidden = !(np.loopActive || np.isLoopSession);
    els.pbPinned.hidden = state.pinnedNpTabId == null;
    els.npPinned.hidden = state.pinnedNpTabId == null;
    els.pbStale.hidden = !stale;
    els.npStale.hidden = !stale;
    els.pbPlay.innerHTML = icon(np.paused ? "play" : "pause", 18);
    els.npPlay.innerHTML = icon(np.paused ? "play" : "pause", 22);
    els.pbMute.innerHTML = icon(np.muted ? "mute" : "volume", 18);
    els.pbLoop.classList.toggle(
      "on",
      Boolean(np.loopActive || np.isLoopSession),
    );
    els.pbLike.innerHTML = icon(np.liked === true ? "heartFill" : "heart", 18);
    els.pbLike.classList.toggle("on", np.liked === true);
    els.npLike.innerHTML = icon(np.liked === true ? "heartFill" : "heart", 18);
    els.npLike.classList.toggle("on", np.liked === true);
    els.pbLike.title =
      np.liked == null
        ? "Estado de like no disponible en esta pestaña"
        : np.liked
          ? "Quitar Me gusta"
          : "Dar Me gusta";
    const remaining = Math.max(
      0,
      (np.minRequired || 20) - (np.sessionSeconds || 0),
    );
    if (remaining === 0) {
      els.npCount.textContent = "✓ Registrado en tu recap";
      els.npCount.classList.add("saved");
    } else {
      els.npCount.textContent = `Se registra en ${remaining}s`;
      els.npCount.classList.remove("saved");
    }
    const metaBits = [];
    if (np.category) metaBits.push(translateCategory(np.category));
    if (np.contentType === "short") metaBits.push("Short");
    else if (np.contentType === "live") metaBits.push("En vivo");
    if (np.context === "mix") metaBits.push("Mix");
    else if (np.context === "playlist") metaBits.push("Playlist");
    if (np.playbackRate && np.playbackRate !== 1)
      metaBits.push(`${np.playbackRate}x`);
    els.npMeta.replaceChildren(
      ...metaBits.map((t) => el("span", "badge source", t)),
    );
  }
  updateSeek();
  renderQueue(sel?.others || []);
}
function renderQueue(others) {
  if (els.npPanel.hidden) return;
  const qsig =
    others
      .map(
        (t) =>
          `${t.storageKey || t.tabId}|${t.paused}|${t.title}|${Math.floor(t.currentTime)}`,
      )
      .join(",") + `|${state.pinnedNpTabId}`;
  if (qsig === lastQueueSig) return;
  lastQueueSig = qsig;
  const nodes = [el("div", "queue-title", `Otras pestañas (${others.length})`)];
  if (!others.length)
    nodes.push(
      emptyState("queue", "No hay otras pestañas de YouTube abiertas."),
    );
  for (const tab of others) {
    const wrap = el("div", "queue-item");
    const btn = el("button", "np-other-btn");
    btn.type = "button";
    const st = el(
      "span",
      tab.paused ? "np-other-state" : "np-other-state playing",
    );
    st.innerHTML = icon(tab.paused ? "pause" : "play", 12);
    const img = el("img", "np-other-thumb");
    if (tab.artwork) img.src = tab.artwork;
    img.alt = "";
    const m = el("div", "meta");
    m.append(
      el("div", "np-other-title", tab.title),
      el(
        "div",
        "np-other-sub",
        `${tab.source === "yt_music" ? "YT Music" : tab.isMusic ? "YouTube · Música" : "YouTube"} · ${tab.artist}`,
      ),
    );
    btn.append(
      st,
      img,
      m,
      el("span", "np-other-time", formatClock(tab.currentTime)),
    );
    btn.addEventListener("click", () => {
      state.pinnedNpTabId = tab.storageKey || tab.tabId;
      renderPlayer();
    });
    const playBtn = el("button", "queue-mini");
    playBtn.type = "button";
    playBtn.title = tab.paused
      ? "Reproducir en esa pestaña"
      : "Pausar esa pestaña";
    playBtn.innerHTML = icon(tab.paused ? "play" : "pause", 13);
    playBtn.addEventListener("click", () =>
      sendControl(tab.paused ? "play" : "pause", undefined, tab.tabId),
    );
    const pinBtn = el(
      "button",
      `queue-mini${state.pinnedNpTabId === (tab.storageKey || tab.tabId) ? " on" : ""}`,
    );
    pinBtn.type = "button";
    pinBtn.title = "Pinear como principal";
    pinBtn.innerHTML = icon("pin", 13);
    pinBtn.addEventListener("click", () => {
      const key = tab.storageKey || tab.tabId;
      state.pinnedNpTabId = state.pinnedNpTabId === key ? null : key;
      renderPlayer();
    });
    const jumpBtn = el("button", "queue-mini");
    jumpBtn.type = "button";
    jumpBtn.title = "Ir a esa pestaña";
    jumpBtn.innerHTML = icon("jump", 13);
    jumpBtn.addEventListener("click", () => jumpToTab(tab.tabId));
    wrap.append(btn, playBtn, pinBtn, jumpBtn);
    nodes.push(wrap);
  }
  els.queuePop.replaceChildren(...nodes);
}
function setNpOpen(open) {
  state.npOpen = open;
  els.npPanel.hidden = !open;
  localStorage.setItem("recapNpOpen", open ? "1" : "0");
  els.miniToggleBtn.classList.toggle("active", open);
  els.miniToggleBtn.setAttribute("aria-pressed", String(open));
  if (open) renderPlayer();
}
function toggleNp() {
  setNpOpen(!state.npOpen);
}

// ---------- búsqueda ----------
function searchHitNodes() {
  return [...els.searchDrop.querySelectorAll(".search-hit, .search-chip")];
}
function setSearchIndex(idx) {
  const nodes = searchHitNodes();
  state.searchIndex = idx;
  nodes.forEach((n, i) => n.classList.toggle("is-active", i === idx));
  if (nodes[idx]) nodes[idx].scrollIntoView({ block: "nearest" });
}
function renderSearchDrop(q) {
  const nodes = [el("div", "search-scope", `Buscando en ${scopeName()}`)];
  if (!q) {
    const recent = [],
      seen = new Set();
    for (const s of [...store.searches].sort(
      (a, b) => b.timestamp - a.timestamp,
    )) {
      const inScope =
        scopeValue() === "yt_music"
          ? s.source === "yt_music"
          : s.source === "youtube";
      if (!inScope || seen.has(s.normalized)) continue;
      seen.add(s.normalized);
      recent.push(s);
      if (recent.length >= 8) break;
    }
    nodes.append(el("div", "search-group-title", "Búsquedas recientes"));
    if (!recent.length)
      nodes.push(
        emptyState("search", "Sin búsquedas recientes en esta página."),
      );
    else {
      const chips = el("div", "search-chips");
      chips.append(
        ...recent.map((s) => {
          const c = el("button", "search-chip", s.query);
          c.type = "button";
          c.addEventListener("click", () => {
            els.globalSearch.value = s.query;
            state.q = s.query;
            els.searchDrop.hidden = true;
            els.globalSearch.setAttribute("aria-expanded", "false");
            navigate(state.scope, "results");
          });
          return c;
        }),
      );
      nodes.push(chips);
    }
  } else {
    const vm = searchVM(q, scopeValue(), store);
    const group = (title, items, make) => {
      if (!items.length) return;
      nodes.append(el("div", "search-group-title", title));
      nodes.push(...items.map(make));
    };
    const hit = (artwork, name, title, sub, onOpen) => {
      const b = el("button", "search-hit");
      b.type = "button";
      if (artwork) {
        const img = el("img");
        img.src = artwork;
        img.alt = "";
        attachImgFallback(img, name);
        b.append(img);
      } else {
        const mono = createMonogram(name);
        mono.style.width = "30px";
        mono.style.height = "30px";
        mono.style.borderRadius = "5px";
        mono.style.fontSize = "12px";
        b.append(mono);
      }
      const m = el("div", "meta");
      const t = el("div", "t");
      t.append(highlight(title, q));
      m.append(t, el("div", "s", sub));
      b.append(m);
      b.addEventListener("click", () => {
        els.searchDrop.hidden = true;
        els.globalSearch.setAttribute("aria-expanded", "false");
        onOpen();
      });
      return b;
    };
    group("Temas", vm.tracks.slice(0, 4), (t) =>
      hit(t.artwork, t.artist, t.title, t.artist, () => openUrl(t.videoUrl)),
    );
    group("Artistas", vm.artists.slice(0, 3), (a) =>
      hit(a.artwork, a.name, a.name, `${a.plays} rep.`, () =>
        navigate(state.scope, "people", a.name),
      ),
    );
    group("Canales", vm.channels.slice(0, 3), (v) =>
      hit(v.avatar, v.name, v.name, "Canal visitado", () =>
        navigate(state.scope, "people", v.name),
      ),
    );
    group("Búsquedas", vm.searches.slice(0, 3), (s) =>
      hit(
        "",
        s.query,
        s.query,
        s.source === "yt_music" ? "YT Music" : "YouTube",
        () => openUrl(s.url),
      ),
    );
    if (nodes.length === 1)
      nodes.push(emptyState("search", "Sin coincidencias."));
    nodes.append(
      el("div", "search-kbd-hint", "↑/↓ navegar · Enter abrir · Esc cerrar"),
    );
  }
  els.searchDrop.replaceChildren(...nodes);
  els.searchDrop.hidden = false;
  els.globalSearch.setAttribute("aria-expanded", "true");
  state.searchIndex = -1;
}

// ---------- ambient header ----------
const ambientCache = new Map();
let ambientToken = 0;
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}
function pickAmbientArt() {
  try {
    if (state.route === "calendar") {
      const art = memoVM(
        `calMonthArt:${calUi.calYear}-${calUi.calMonth}`,
        () => {
          const mine = allPlays().filter((p) => {
            const d = new Date(p.timestamp);
            return (
              d.getFullYear() === calUi.calYear &&
              d.getMonth() === calUi.calMonth
            );
          });
          const top = aggregateTracks(mine)[0];
          return top?.artwork || "";
        },
      );
      if (art) return art;
      const best = vmCalHero().bestMonth;
      if (!best) return "";
      return memoVM(`calBestArt:${calUi.calYear}-${best.index}`, () => {
        const mine = allPlays().filter((p) => {
          const d = new Date(p.timestamp);
          return (
            d.getFullYear() === calUi.calYear && d.getMonth() === best.index
          );
        });
        return aggregateTracks(mine)[0]?.artwork || "";
      });
    }
    if (state.route === "people" && state.detail) {
      const d = isMusicScope()
        ? memoVM(`artistDetail:${state.detail}`, () =>
            artistDetailVM(
              state.detail,
              allPlays(),
              metaAll(store.interactions),
            ),
          )
        : memoVM(`channelDetail:${state.detail}`, () =>
            channelDetailVM(
              state.detail,
              allPlays(),
              metaAll(store.channelVisits),
            ),
          );
      return (isMusicScope() ? d?.artwork : d?.avatar) || "";
    }
    if (state.route === "likes") return vmLikesPage().collage[0] || "";
    if (state.route === "people") {
      const a = vmDirectory().list[0];
      return a?.artwork || a?.avatar || "";
    }
    const sum = vmSummary();
    return sum.empty ? "" : sum.topTracks[0]?.artwork || "";
  } catch {
    return "";
  }
}
function updateAmbient() {
  const url = pickAmbientArt();
  const token = ++ambientToken;
  if (!url) {
    els.mainCol.style.removeProperty("--ambient");
    return;
  }
  if (ambientCache.has(url)) {
    const c = ambientCache.get(url);
    if (c) els.mainCol.style.setProperty("--ambient", c);
    else els.mainCol.style.removeProperty("--ambient");
    return;
  }
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    if (token !== ambientToken) return;
    try {
      const cv = document.createElement("canvas");
      cv.width = 24;
      cv.height = 24;
      const cx = cv.getContext("2d", { willReadFrequently: true });
      cx.drawImage(img, 0, 0, 24, 24);
      const data = cx.getImageData(0, 0, 24, 24).data;
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < 128) continue;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n++;
      }
      if (!n) throw new Error("empty");
      const [h, s, l] = rgbToHsl(r / n, g / n, b / n);
      const color = `hsl(${h} ${Math.min(70, Math.max(45, s))}% ${Math.min(40, Math.max(26, l))}%)`;
      ambientCache.set(url, color);
      els.mainCol.style.setProperty("--ambient", color);
    } catch {
      ambientCache.set(url, "");
      els.mainCol.style.removeProperty("--ambient");
    }
  };
  img.onerror = () => {
    ambientCache.set(url, "");
    if (token === ambientToken) els.mainCol.style.removeProperty("--ambient");
  };
  img.src = url;
}

// ---------- calendario ----------
function structureCalendar() {
  const monthView = domCal.calMonthView;
  if (monthView.querySelector(".cal-main")) return;
  const main = el("div", "cal-main"),
    rail = el("div", "cal-rail");
  const dayPanel = domCal.calDayList.closest(".cal-section");
  const topPanel = domCal.calMonthTopList.closest(".cal-section");
  const weeksPanel = domCal.calWeeksList.closest(".cal-section");
  const calendarBox = monthView.querySelector(".calendar-box");
  for (const n of [...monthView.children]) {
    if (n === domCal.calMonthStatsBox || n === dayPanel) rail.append(n);
    else main.append(n);
  }
  monthView.append(main, rail);
  rail.prepend(domCal.calMonthStatsBox);
  main.append(
    ...[
      calendarBox,
      topPanel,
      domCal.calMonthChannelsBox,
      domCal.calMonthCatsBox,
      domCal.calWeekdayBox,
      domCal.calMonthSocialBox,
      weeksPanel,
    ].filter(Boolean),
  );
}
function initCalendarTooltips() {
  const sel = ".cal-day, .yr-cell, .wd-col, .leg-box, .week-chip";
  els.calHost.addEventListener("mouseover", (e) => {
    const t = e.target.closest(sel);
    if (!t) return;
    const title = t.getAttribute("title");
    if (title) {
      t.dataset.tip = title;
      t.removeAttribute("title");
    }
    if (t.dataset.tip) showTip(t.dataset.tip, e.clientX, e.clientY);
  });
  els.calHost.addEventListener("mousemove", (e) => {
    const t = e.target.closest(sel);
    if (t?.dataset.tip) showTip(t.dataset.tip, e.clientX, e.clientY);
  });
  els.calHost.addEventListener("mouseout", (e) => {
    if (e.target.closest(sel)) hideTip();
  });
  els.calHost.addEventListener("focusin", (e) => {
    const t = e.target.closest(sel);
    if (!t) return;
    const title = t.getAttribute("title");
    if (title) {
      t.dataset.tip = title;
      t.removeAttribute("title");
    }
    if (!t.dataset.tip) return;
    const r = t.getBoundingClientRect();
    showTip(t.dataset.tip, r.left + r.width / 2, r.bottom);
  });
  els.calHost.addEventListener("focusout", (e) => {
    if (e.target.closest(sel)) hideTip();
  });
}
function initTopbarScroll() {
  const onScroll = () => {
    const y = els.content.scrollTop;
    els.topbar.classList.toggle("scrolled", y > 24);
    els.topbar.style.setProperty("--topbar-o", String(Math.min(1, y / 160)));
  };
  els.content.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}
function initNavButtons() {
  els.navBack.addEventListener("click", () => goHist(-1));
  els.navFwd.addEventListener("click", () => goHist(1));
  els.homeBtn.addEventListener("click", () => navigate(state.scope, "home"));
}

// ---------- eventos ----------
els.brandBtn.addEventListener("click", () => {
  const next = state.scope === "music" ? "youtube" : "music";
  navigate(next, state.perScopeRoute[next] || "home");
  toast(next === "music" ? "Página Music" : "Página YouTube sin música");
});
els.sideNav
  .querySelectorAll(".side-link")
  .forEach((b) =>
    b.addEventListener("click", () => navigate(state.scope, b.dataset.route)),
  );
els.newPlaylistBtn.addEventListener("click", () =>
  playIds(
    aggregateTracks(periodPlays()).map((t) => t.videoId),
    "este período",
  ),
);

let libTimer = null;
els.libSearch.addEventListener("input", () => {
  if (libTimer) clearTimeout(libTimer);
  libTimer = setTimeout(() => {
    state.libQuery = els.libSearch.value;
    renderSideLists();
  }, 150);
});

let searchTimer = null;
els.globalSearch.addEventListener("input", () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.q = els.globalSearch.value.trim();
    renderSearchDrop(state.q);
  }, 200);
});
els.globalSearch.addEventListener("focus", () => {
  if (!els.globalSearch.value.trim()) renderSearchDrop("");
});
els.globalSearch.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (els.searchDrop.hidden) renderSearchDrop(els.globalSearch.value.trim());
    setSearchIndex(
      Math.min(state.searchIndex + 1, searchHitNodes().length - 1),
    );
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    setSearchIndex(Math.max(state.searchIndex - 1, 0));
  } else if (e.key === "Enter") {
    e.preventDefault();
    const active = searchHitNodes()[state.searchIndex];
    if (active) active.click();
    else {
      state.q = els.globalSearch.value.trim();
      els.searchDrop.hidden = true;
      els.globalSearch.setAttribute("aria-expanded", "false");
      navigate(state.scope, "results");
    }
  } else if (e.key === "Escape") {
    els.searchDrop.hidden = true;
    els.globalSearch.setAttribute("aria-expanded", "false");
  }
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-wrap")) {
    els.searchDrop.hidden = true;
    els.globalSearch.setAttribute("aria-expanded", "false");
  }
  if (!e.target.closest("#helpPop") && !e.target.closest("#helpBtn"))
    els.helpPop.hidden = true;
});
document.addEventListener("keydown", (e) => {
  const typing = /^(input|textarea|select)$/i.test(e.target.tagName);
  if (e.key === "Escape") {
    els.helpPop.hidden = true;
    els.searchDrop.hidden = true;
    setNpOpen(false);
    return;
  }
  if (
    typing ||
    e.metaKey ||
    e.ctrlKey ||
    e.altKey ||
    els.confirmClearDialog.open
  )
    return;
  switch (e.key) {
    case " ":
    case "k":
    case "K":
      e.preventDefault();
      els.pbPlay.click();
      break;
    case "j":
    case "J":
      if (state.currentNp?.duration > 0)
        sendControl("seek", Math.max(0, state.currentNp.currentTime - 5));
      break;
    case "l":
    case "L":
      if (state.currentNp?.duration > 0)
        sendControl(
          "seek",
          Math.min(state.currentNp.duration, state.currentNp.currentTime + 5),
        );
      break;
    case "m":
      sendControl("mute");
      break;
    case "M":
      els.brandBtn.click();
      break;
    case "n":
    case "N":
      sendControl("next");
      break;
    case "p":
    case "P":
      sendControl("prev");
      break;
    case "q":
    case "Q":
      toggleNp();
      break;
    case "v":
    case "V":
      toggleNp();
      break;
    case "?":
    case "h":
    case "H":
      els.helpPop.hidden = !els.helpPop.hidden;
      break;
  }
});
els.pbPlay.addEventListener("click", () => {
  if (!state.currentNp) return toast("No hay nada reproduciéndose.");
  sendControl(state.currentNp.paused ? "play" : "pause");
});
els.npPlay.addEventListener("click", () => els.pbPlay.click());
els.pbPrev.addEventListener("click", () => sendControl("prev"));
els.pbNext.addEventListener("click", () => sendControl("next"));
els.pbMute.addEventListener("click", () => sendControl("mute"));
els.pbLoop.addEventListener("click", () => sendControl("loop"));
els.pbShuffle.addEventListener("click", () => sendControl("shuffle"));
els.pbLike.addEventListener("click", async () => {
  if (!state.currentNp) return toast("No hay nada reproduciéndose.");
  const ok = await sendControl("like");
  if (ok) setTimeout(renderPlayer, 700);
});
els.npLike.addEventListener("click", () => els.pbLike.click());
els.pbJump.addEventListener("click", () => {
  if (state.currentTabId != null) jumpToTab(state.currentTabId);
  else toast("No hay pestaña activa.");
});
els.npJump.addEventListener("click", () => els.pbJump.click());
els.pbSeek.addEventListener("input", () => {
  state.seeking = true;
  const np = state.currentNp,
    pct = Number(els.pbSeek.value) / 10;
  els.pbSeek.style.setProperty("--pb-fill", `${pct}%`);
  if (np?.duration > 0)
    els.pbTime.textContent = formatClock(
      (Number(els.pbSeek.value) / 1000) * np.duration,
    );
});
els.pbSeek.addEventListener("change", () => {
  const np = state.currentNp;
  state.seeking = false;
  if (np?.duration > 0)
    sendControl("seek", (Number(els.pbSeek.value) / 1000) * np.duration);
});
let volTimer = null;
els.pbVol.addEventListener("input", () => {
  const v = Number(els.pbVol.value);
  els.pbVol.style.setProperty("--pb-vol", `${v}%`);
  if (volTimer) clearTimeout(volTimer);
  volTimer = setTimeout(() => sendControl("volume", v / 100), 120);
});
els.pbQueue.addEventListener("click", toggleNp);
els.miniToggleBtn.addEventListener("click", toggleNp);
els.npClose.addEventListener("click", () => setNpOpen(false));
els.helpBtn.addEventListener("click", () => {
  els.helpPop.hidden = !els.helpPop.hidden;
});
els.importBtn.addEventListener("click", () => {
  if (urlParams.get("import") === "1")
    toast("Elegí tu archivo .zip o .json con el botón Importar.");
  els.importInput.click();
});
els.importInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const { updatedData, message } = await importFromFile(file, store);
    await persistStore(updatedData);
    Object.assign(store, updatedData);
    if (migrateMusicFlags(store)) await persistMusicFlags(store);
    state.animateNext = true;
    renderAll();
    toast(message);
  } catch (err) {
    toast(`Error al importar: ${err.message}`, true);
  } finally {
    els.importInput.value = "";
  }
});
els.exportBtn.addEventListener("click", async () => {
  const orig = els.exportBtn.innerHTML;
  els.exportBtn.disabled = true;
  els.exportBtn.textContent = "⏳...";
  try {
    const sum = vmSummary();
    const cardData = sum.empty
      ? null
      : {
          subtitle:
            `${periodLabel()} · ${state.scope === "music" ? "MUSIC" : "YOUTUBE"}`.toUpperCase(),
          topTracks: sum.topTracks.slice(0, 5),
          totalSeconds: sum.totalSeconds,
          totalPlays: sum.totalPlays,
          totalLoops: sum.totalLoops,
          topArtist: sum.topArtist,
        };
    const blob = await buildExportZip(store, cardData, (p) => {
      els.exportBtn.textContent = p;
    });
    downloadBlob(blob, `youtube-recap-${toDateKey(new Date())}.zip`);
    toast("✓ ZIP exportado (datos + tarjeta PNG).");
  } catch (err) {
    toast(`Error al exportar: ${err.message}`, true);
  } finally {
    els.exportBtn.disabled = false;
    els.exportBtn.innerHTML = orig;
  }
});
els.enrichMusicBtn.addEventListener("click", async () => {
  const orig = els.enrichMusicBtn.textContent;
  els.enrichMusicBtn.disabled = true;
  try {
    const res = await enrichImported(store, (p) => {
      els.enrichMusicBtn.textContent = p;
    });
    if (res.none) {
      toast("No hay registros de YouTube sin categoría para reclasificar.");
      return;
    }
    if (res.updated > 0) {
      await persistMusicFlags(store);
      state.animateNext = true;
      renderAll();
    }
    toast(
      res.updated > 0
        ? `✓ Reclasificados ${res.updated} registros.${res.remaining > 0 ? ` Quedan ${res.remaining} para otra corrida.` : ""}`
        : `Sin cambios: ${res.consulted} videos consultados.${res.remaining > 0 ? ` Quedan ${res.remaining} para otra corrida.` : ""}`,
    );
  } catch (err) {
    toast(`Error al reclasificar: ${err.message}`, true);
  } finally {
    els.enrichMusicBtn.disabled = false;
    els.enrichMusicBtn.textContent = orig;
  }
});
els.clearBtn.addEventListener("click", () =>
  els.confirmClearDialog.showModal(),
);
els.cancelClearBtn.addEventListener("click", () =>
  els.confirmClearDialog.close(),
);
els.confirmClearDialog.addEventListener("click", (e) => {
  if (e.target === els.confirmClearDialog) els.confirmClearDialog.close();
});

els.confirmClearBtn.addEventListener("click", async () => {
  els.confirmClearDialog.close();
  await clearAllData();
  Object.assign(store, emptyStore());
  dataIndexKey = null;
  state.animateNext = true;
  renderAll();
  toast("✓ Historial local borrado.");
});

chrome.tabs.onRemoved.addListener((tabId) => {
  npService.removeTab(tabId);
  renderPlayer();
});
let dataTimer = null;
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  const { npChanged, needSync, dataChanged, updates } =
    npService.applyChanges(changes);
  if (needSync) await npService.sync();
  if (npChanged) renderPlayer();
  if (dataChanged) {
    Object.assign(store, updates);
    if (changedHistShards.length)
      await npService.reloadHistoryShards(store, changedHistShards);
    dataIndexKey = null;
    if (dataTimer) clearTimeout(dataTimer);
    dataTimer = setTimeout(refreshData, 1200);
  }
});
window.addEventListener("resize", () => {
  hideTip();
  mountedRows.forEach((fn) => fn());
});
let playerInterval = null;
function cleanup() {
  if (playerInterval) clearInterval(playerInterval);
  if (dataTimer) clearTimeout(dataTimer);
  if (searchTimer) clearTimeout(searchTimer);
  if (volTimer) clearTimeout(volTimer);
  if (libTimer) clearTimeout(libTimer);
  if (dirTimer) clearTimeout(dirTimer);
  if (toastTimer) clearTimeout(toastTimer);
  if (toastGapTimer) clearTimeout(toastGapTimer);
  ambientToken += 1;
  cancelCountUps();
  for (const io of observers) io.disconnect();
  observers.clear();
  mountedRows.clear();
  pendingShelves.length = 0;
  hideTip();
}
window.addEventListener("pagehide", cleanup);

// ---------- init ----------
function skeletonHome() {
  const host = els.routes.home;
  host.replaceChildren();
  const hero = el("div", "hero");
  const l = el("div", "skel-line");
  l.style.width = "260px";
  l.style.height = "26px";
  hero.append(l);
  host.append(hero);
  for (let i = 0; i < 2; i++) {
    const sec = el("section", "shelf");
    const row = el("div", "shelf-row");
    row.append(...skeletonRow());
    sec.append(row);
    host.append(sec);
  }
}
async function init() {
  mountIcons(document);
  skeletonHome();
  els.calHost.innerHTML = CALENDAR_MARKUP;
  domCal = {};
  for (const id of CALENDAR_DOM_IDS) domCal[id] = $(id);
  structureCalendar();
  bindCalendarControls(domCal, calUi, () => {
    state.sigs = computeSigs();
    renderCalendarRoute();
  });
  domCal.calMonthImgBtn.addEventListener("click", () =>
    exportPngCard(calUi.monthCardData, domCal.calMonthImgBtn),
  );
  domCal.calMonthPlaylistBtn.addEventListener("click", () =>
    openInstantPlaylist(calUi.monthTopVideoIds),
  );
  initCalendarTooltips();
  initTopbarScroll();
  initNavButtons();
  const savedNp = localStorage.getItem("recapNpOpen");
  setNpOpen(savedNp == null ? innerWidth >= 1200 : savedNp === "1");
  parseHash();
  if (!location.hash)
    location.hash = `#/${state.scope}/${state.perScopeRoute[state.scope] || "home"}`;
  navHist.entries = [navKey(state.scope, state.route, state.detail)];
  navHist.idx = 0;
  updateNavButtons();
  const [{ store: loaded, all }] = await Promise.all([
    loadStore(),
    npService.sync(),
  ]);
  Object.assign(store, loaded);
  if (!all.musicFlagMigratedV1) {
    const changed = migrateMusicFlags(store);
    const payload = { musicFlagMigratedV1: true };
    if (changed) {
      payload.history = store.history;
      payload.skips = store.skips;
      payload.interactions = store.interactions;
    }
    await chrome.storage.local.set(payload);
  }
  const stale = npService.loadInitial(all);
  if (stale.length) chrome.storage.local.remove(stale);
  renderAll();
  playerInterval = setInterval(() => {
    if (!document.hidden) renderPlayer();
  }, 3000);
  if (urlParams.get("import") === "1")
    toast(
      "Modo completo abierto: tocá «Importar» para elegir tu archivo .zip o .json.",
    );
}
init();
