// src/full.js — v2.5.1
// PATCH B: mount síncrono de shelves visibles + persistencia de scrollLeft.
// PATCH C: firmas struct/metrics, update in-place, debounce mayor, memo de VMs,
//          gate de calendario y cleanup explícito en pagehide.
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
  importFromFile,
  enrichImported,
  NowPlaying,
  emptyStore,
} from "./recapStore.js";
import {
  summaryVM,
  activityVM,
  channelsVM,
  likesVM,
  homeVM,
  searchVM,
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
  sigs: null,
};

const store = emptyStore();
const npService = new NowPlaying();
const observers = new Set();

// PATCH B: posición horizontal de cada shelf, keyed por scope|ruta|período|título.
const shelfScroll = new Map();
const pendingShelves = [];
const mountedRows = new Map();

// PATCH C: memo de view-models por firma de datos.
let memoSigKey = null;
const memo = new Map();

const calUi = {
  calViewMode: "month",
  calSearchQuery: "",
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  selectedDateKey: toDateKey(new Date()),
  calDayMode: "all",
  monthTopVideoIds: [],
  monthCardData: null,
};
let domCal = null;

const els = {
  mainCol: $("mainCol"),
  brandBtn: $("brandBtn"),
  brandLogo: $("brandLogo"),
  brandWord: $("brandWord"),
  sideNav: $("sideNav"),
  peopleLabel: $("peopleLabel"),
  newPlaylistBtn: $("newPlaylistBtn"),
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
  calHost: $("calHost"),
  pbSeek: $("pbSeek"),
  pbPrev: $("pbPrev"),
  pbPlay: $("pbPlay"),
  pbNext: $("pbNext"),
  pbTime: $("pbTime"),
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
  miniplayer: $("miniplayer"),
  mpHead: $("mpHead"),
  mpClose: $("mpClose"),
  mpThumb: $("mpThumb"),
  mpTitle: $("mpTitle"),
  mpArtist: $("mpArtist"),
  mpFill: $("mpFill"),
  mpPlay: $("mpPlay"),
  mpJump: $("mpJump"),
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
let toastBusy = false;
let toastTimer = null;
let toastGapTimer = null;
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

function scopeValue() {
  return state.scope === "music" ? "yt_music" : "youtube";
}
function scopeName() {
  return state.scope === "music" ? "Music" : "YouTube sin música";
}
function periodPlays() {
  return store.history.filter((it) =>
    matchesFilter(it, state.period, scopeValue(), true),
  );
}
function allPlays() {
  return store.history.filter((it) =>
    matchesFilter(it, "all", scopeValue(), false),
  );
}
function meta(items) {
  return items.filter((it) =>
    matchesPeriodAndSourceOnly(it, state.period, scopeValue(), true),
  );
}
function metaAll(items) {
  return items.filter((it) =>
    matchesPeriodAndSourceOnly(it, "all", scopeValue(), false),
  );
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
    const key = getGroupKey(it);
    const cur = map.get(key);
    if (!cur || it.timestamp > cur.timestamp) map.set(key, it);
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
  const mark = document.createElement("mark");
  mark.textContent = text.slice(idx, idx + q.length);
  frag.append(mark);
  frag.append(text.slice(idx + q.length));
  return frag;
}
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// ---------- PATCH C: firmas de datos ----------
function computeSigs() {
  const plays = periodPlays();
  const inter = meta(store.interactions);
  const searches = meta(store.searches);
  const visits = meta(store.channelVisits);

  let sh = 0;
  for (const p of plays) {
    sh =
      (sh * 31 +
        hashStr(
          `${p.trackKey}|${p.title}|${p.artist}|${p.contentType}|${p.category}|${p.isMusic ? 1 : 0}`,
        )) |
      0;
  }
  let ih = 0;
  for (const it of inter) ih = (ih * 31 + hashStr(it.id + it.type)) | 0;
  let se = 0;
  for (const s of searches) se = (se * 31 + hashStr(s.id)) | 0;
  let vi = 0;
  for (const v of visits) vi = (vi * 31 + hashStr(v.id)) | 0;

  let struct = `${state.scope}|${state.route}|${state.period}|${plays.length}|${sh}|${inter.length}|${ih}|${searches.length}|${se}|${visits.length}|${vi}`;

  // Calendario: solo re-render si cambia la estructura o el bucket de heat,
  // no en cada tick de segundos.
  if (state.route === "calendar") {
    const buckets = new Map();
    const touch = (k) => {
      if (!buckets.has(k)) buckets.set(k, { sec: 0 });
    };
    for (const p of allPlays()) {
      const k = toDateKey(new Date(p.timestamp));
      const b = buckets.get(k) || { sec: 0 };
      b.sec += p.seconds || 0;
      buckets.set(k, b);
    }
    for (const it of metaAll(store.interactions))
      touch(toDateKey(new Date(it.timestamp)));
    for (const s of metaAll(store.searches))
      touch(toDateKey(new Date(s.timestamp)));
    let hh = 0;
    const keys = [...buckets.keys()].sort();
    for (const k of keys) {
      const sec = buckets.get(k).sec;
      const level = sec >= 7200 ? 4 : sec >= 2700 ? 3 : sec >= 900 ? 2 : 1;
      hh = (hh * 31 + hashStr(`${k}:${level}`)) | 0;
    }
    struct += `|cal${hh}`;
  }

  let totalSeconds = 0;
  let loops = 0;
  const hours = new Array(24).fill(0);
  for (const p of plays) {
    totalSeconds += p.seconds || 0;
    if (p.isLoop) loops += 1;
    hours[new Date(p.timestamp).getHours()] += p.seconds || 0;
  }
  const peak = hours.indexOf(Math.max(...hours));
  const metrics = `${totalSeconds}|${loops}|${peak}`;
  return { struct, metrics };
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
      store.skips.filter((it) =>
        matchesFilter(it, state.period, scopeValue(), true),
      ),
    ),
  );
const vmLikes = () =>
  memoVM("likes", () =>
    likesVM(meta(store.interactions), meta(store.searches)),
  );
const vmChannels = (sort, min) =>
  memoVM(`channels:${sort}:${min}`, () =>
    channelsVM(meta(store.channelVisits), periodPlays(), sort, min),
  );

// ---------- tooltip ----------
function showTip(text, x, y) {
  els.chartTip.textContent = text;
  els.chartTip.hidden = false;
  const pad = 14;
  const r = els.chartTip.getBoundingClientRect();
  let left = x + pad;
  let top = y + pad;
  if (left + r.width > innerWidth - 8) left = x - r.width - pad;
  if (top + r.height > innerHeight - 8) top = y - r.height - pad;
  els.chartTip.style.left = `${Math.max(8, left)}px`;
  els.chartTip.style.top = `${Math.max(8, top)}px`;
}
function hideTip() {
  els.chartTip.hidden = true;
}
function tipify(el, textFn) {
  el.addEventListener("mousemove", (e) =>
    showTip(textFn(), e.clientX, e.clientY),
  );
  el.addEventListener("mouseleave", hideTip);
}

// ---------- router ----------
function parseHash() {
  const m = location.hash.match(/^#\/(music|youtube)\/([a-z]+)/);
  if (m) {
    state.scope = m[1];
    state.route = els.routes[m[2]] ? m[2] : "home";
  }
}
function navigate(scope, route) {
  state.scope = scope;
  state.route = route;
  state.perScopeRoute[scope] = route;
  localStorage.setItem("recapFullScope", scope);
  localStorage.setItem(
    scope === "music" ? "recapRouteMusic" : "recapRouteYoutube",
    route,
  );
  const hash = `#/${scope}/${route}`;
  if (location.hash !== hash) location.hash = hash;
  else renderAll();
}
window.addEventListener("hashchange", () => {
  parseHash();
  renderAll();
});

// ---------- shell ----------
function renderInlineStats(sum) {
  els.inlineStats.replaceChildren();
  if (!sum.empty) {
    const strong = (t) => {
      const s = document.createElement("strong");
      s.textContent = t;
      return s;
    };
    els.inlineStats.append(
      strong(String(sum.totalPlays)),
      " rep · ",
      strong(formatDuration(sum.totalSeconds)),
      " · ",
      strong(String(sum.unique)),
      " únicos",
    );
  } else {
    els.inlineStats.textContent = "Sin datos en este período";
  }
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
  els.sideNav.querySelectorAll(".side-link").forEach((b) => {
    const active = b.dataset.route === state.route;
    b.classList.toggle("active", active);
    if (active) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  els.periodChips.replaceChildren(
    ...PERIODS.map(([value, label]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "period-chip" + (state.period === value ? " active" : "");
      b.textContent = label;
      b.addEventListener("click", () => {
        state.period = value;
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
  const vm = vmHome();
  const nodes = [];
  const liked = meta(store.interactions).filter((it) => it.type === "like");
  const likedBtn = document.createElement("button");
  likedBtn.type = "button";
  likedBtn.className = "side-list";
  const lt = document.createElement("strong");
  lt.innerHTML = icon("heartFill", 12);
  lt.append(state.scope === "music" ? " Liked Music" : " Me gusta (videos)");
  const ls = document.createElement("span");
  ls.textContent = `${liked.length} me gusta · lista generada`;
  likedBtn.append(lt, ls);
  likedBtn.addEventListener("click", () => navigate(state.scope, "likes"));
  nodes.push(likedBtn);

  for (const m of vm.months.slice(0, 8)) {
    if (m.plays === 0) continue;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "side-list";
    const t = document.createElement("strong");
    t.textContent = `${m.label} Recap '${String(m.year).slice(2)}`;
    const s = document.createElement("span");
    s.dataset.month = `${m.y}-${m.m}`;
    s.textContent = `${formatDuration(m.seconds)} · ${m.plays} rep.`;
    b.append(t, s);
    b.addEventListener("click", () => {
      calUi.calYear = m.y;
      calUi.calMonth = m.m;
      calUi.selectedDateKey = toDateKey(new Date(m.y, m.m, 1));
      calUi.calViewMode = "month";
      navigate(state.scope, "calendar");
    });
    nodes.push(b);
  }
  els.sideLists.replaceChildren(...nodes);
}

// ---------- PATCH C: actualización in-place de métricas ----------
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

  const vals = [
    sum.empty ? "0 min" : formatDuration(sum.totalSeconds),
    String(sum.empty ? 0 : sum.totalPlays),
    `🔁 ${sum.empty ? 0 : sum.totalLoops}`,
    String(sum.empty ? 0 : sum.unique),
    `${sum.empty ? 0 : sum.streak} días`,
    sum.empty ? "—" : sum.peakLabel,
  ];
  els.routes.explore
    .querySelectorAll(".explore-grid .stat-card")
    .forEach((c, i) => {
      const st = c.querySelector("strong");
      if (st && vals[i] != null) st.textContent = vals[i];
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
  const card = document.createElement("button");
  card.type = "button";
  card.className = "card";
  const cover = document.createElement("div");
  cover.className =
    "card-cover" +
    (kind === "wide" ? " wide" : "") +
    (kind === "round" ? " round" : "") +
    (kind === "month" ? " month" : "");
  if (kind === "month") {
    const n = document.createElement("span");
    n.className = "m-name";
    n.textContent = month.label;
    const y = document.createElement("span");
    y.className = "m-year";
    y.textContent = `${month.year} · ${month.plays} rep.`;
    cover.append(n, y);
  } else if (artwork) {
    const img = document.createElement("img");
    img.src = artwork;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    attachImgFallback(img, name || title);
    cover.append(img);
  } else if (kind === "round") {
    cover.append(createMonogram(name || title));
  } else {
    const na = document.createElement("span");
    na.className = "no-art";
    na.innerHTML = icon(state.scope === "music" ? "music" : "youtube", 34);
    cover.append(na);
  }
  if (tag) {
    const t = document.createElement("span");
    t.className = "cover-tag";
    t.textContent = tag;
    cover.append(t);
  }
  if (badge) {
    const b = document.createElement("span");
    b.className = "cover-badge";
    b.textContent = badge;
    cover.append(b);
  }
  if (href || onOpen) {
    const play = document.createElement("span");
    play.className = "card-play";
    play.setAttribute("aria-hidden", "true");
    play.innerHTML = icon("play", 16);
    cover.append(play);
  }
  const t = document.createElement("div");
  t.className = "card-title";
  t.textContent = title;
  const s = document.createElement("div");
  s.className = "card-sub";
  s.textContent = sub || "";
  card.append(cover, t, s);
  if (stat) {
    const st = document.createElement("div");
    st.className = "card-stat";
    st.textContent = stat;
    card.append(st);
  }
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
    const c = document.createElement("div");
    c.className = "skel-card";
    const cover = document.createElement("div");
    cover.className = "skel-cover";
    const l1 = document.createElement("div");
    l1.className = "skel-line";
    const l2 = document.createElement("div");
    l2.className = "skel-line short";
    c.append(cover, l1, l2);
    nodes.push(c);
  }
  return nodes;
}

function enableDrag(row) {
  let down = false;
  let dragged = false;
  let startX = 0;
  let startScroll = 0;
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
  const key = `${state.scope}|${state.route}|${state.period}|${title}`;
  const sec = document.createElement("section");
  sec.className = "shelf";
  const head = document.createElement("div");
  head.className = "shelf-head";
  if (eyebrow) {
    const eb = document.createElement("span");
    eb.className = "shelf-eyebrow";
    eb.textContent = eyebrow;
    head.append(eb);
  }
  const ti = document.createElement("h2");
  ti.className = "shelf-title";
  ti.textContent = title;
  head.append(ti);
  const tools = document.createElement("div");
  tools.className = "shelf-tools";
  if (moreRoute) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "shelf-more";
    more.textContent = "Ver todo";
    more.addEventListener("click", () => navigate(state.scope, moreRoute));
    tools.append(more);
  }
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "shelf-arrow";
  prev.setAttribute("aria-label", "Desplazar a la izquierda");
  prev.innerHTML = icon("chevronLeft", 16);
  const next = document.createElement("button");
  next.type = "button";
  next.className = "shelf-arrow";
  next.setAttribute("aria-label", "Desplazar a la derecha");
  next.innerHTML = icon("chevronRight", 16);
  tools.append(prev, next);
  head.append(tools);

  const row = document.createElement("div");
  row.className = "shelf-row";
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
  // PATCH B: guardar posición en cada scroll (incluye smooth y drag).
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

  // PATCH B: mount idempotente que restaura la posición guardada.
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

// PATCH B: hidratación post-render — síncrono si el shelf ya está en viewport.
function hydrateShelves() {
  const cr = els.content.getBoundingClientRect();
  for (const item of pendingShelves) {
    const { sec, mount } = item;
    if (sec._mounted) continue;
    const r = sec.getBoundingClientRect();
    const visible = r.top < cr.bottom + 240 && r.bottom > cr.top - 240;
    if (visible || !("IntersectionObserver" in window)) {
      mount();
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          for (const en of entries) {
            if (en.isIntersecting) {
              mount();
              io.disconnect();
              observers.delete(io);
            }
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
      artwork: a.artwork,
      title: a.name,
      sub: `${a.plays} reproducciones`,
      stat: a.seconds > 0 ? formatDuration(a.seconds) : "visitas",
      href: a.url || undefined,
      onOpen: a.url
        ? undefined
        : () => {
            state.q = a.name;
            els.globalSearch.value = a.name;
            navigate(state.scope, "results");
          },
    }),
  );
}
function emptyBox(msg) {
  const p = document.createElement("p");
  p.className = "empty-msg";
  p.textContent = msg;
  return p;
}
function routeTitle(text) {
  const h = document.createElement("h2");
  h.className = "route-title";
  h.tabIndex = -1;
  h.textContent = text;
  return h;
}

// ---------- rutas ----------
function renderHome() {
  const plays = periodPlays();
  const vm = vmHome();
  const sum = vmSummary();
  const host = els.routes.home;
  host.replaceChildren();

  const hero = document.createElement("div");
  hero.className = "hero";
  const g = document.createElement("h2");
  g.className = "route-title hero-greet";
  g.tabIndex = -1;
  g.textContent = greeting();
  const sub = document.createElement("div");
  sub.className = "hero-sub";
  sub.textContent = `Tu recap de ${scopeName()} · ${periodLabel()}`;
  const kpis = document.createElement("div");
  kpis.className = "hero-kpis";
  const kpi = (label, value) => {
    const k = document.createElement("span");
    k.className = "hero-kpi";
    const s = document.createElement("strong");
    s.textContent = value;
    k.append(s, ` ${label}`);
    return k;
  };
  kpis.append(
    kpi("escuchados", sum.empty ? "0 min" : formatDuration(sum.totalSeconds)),
    kpi("reproducciones", String(sum.empty ? 0 : sum.totalPlays)),
    kpi("únicos", String(sum.empty ? 0 : sum.unique)),
    kpi("días de racha", String(sum.empty ? 0 : sum.streak)),
  );
  hero.append(g, sub, kpis);
  host.append(hero);

  if (plays.length === 0) {
    host.append(
      emptyBox(
        "Todavía no hay datos en este período. Reproducí al menos 20 segundos en YouTube o YT Music y volvé.",
      ),
    );
    return;
  }

  if (state.scope === "music") {
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

  const monthCards = vm.months
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
  if (monthCards.length)
    host.append(
      shelf({
        title: "Recaps por mes",
        cardsFactory: () => monthCards,
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

function statCard(label, value) {
  const card = document.createElement("div");
  card.className = "stat-card";
  const sp = document.createElement("span");
  sp.className = "stat-label";
  sp.textContent = label;
  const st = document.createElement("strong");
  st.textContent = value;
  card.append(sp, st);
  return card;
}

function renderExplore() {
  const plays = periodPlays();
  const vm = vmActivity();
  const sum = vmSummary();
  const host = els.routes.explore;
  host.replaceChildren();
  host.append(routeTitle("Explorar"));

  const grid = document.createElement("div");
  grid.className = "explore-grid";
  grid.append(
    statCard(
      "Tiempo total",
      sum.empty ? "0 min" : formatDuration(sum.totalSeconds),
    ),
    statCard("Reproducciones", String(sum.empty ? 0 : sum.totalPlays)),
    statCard("Bucles", `🔁 ${sum.empty ? 0 : sum.totalLoops}`),
    statCard("Títulos únicos", String(sum.empty ? 0 : sum.unique)),
    statCard("Racha actual", `${sum.empty ? 0 : sum.streak} días`),
    statCard("Hora pico", sum.empty ? "—" : sum.peakLabel),
  );
  host.append(grid);

  const hoursBox = document.createElement("div");
  hoursBox.className = "explore-box wide";
  const hTitle = document.createElement("h3");
  hTitle.textContent =
    "Actividad por hora del día · clic en una barra para ver ese horario";
  const chart = document.createElement("div");
  chart.className = "hours-chart";
  chart.append(
    ...vm.hours.map((sec, h) => {
      const bar = document.createElement("div");
      bar.className = sec === 0 ? "hour-bar zero" : "hour-bar";
      if (state.hourFilter === h) bar.classList.add("selected");
      const pct =
        vm.maxHour > 0 ? Math.max(5, Math.round((sec / vm.maxHour) * 100)) : 5;
      bar.style.height = sec === 0 ? "4px" : `${pct}%`;
      tipify(
        bar,
        () => `${String(h).padStart(2, "0")}:00 — ${formatDuration(sec)}`,
      );
      bar.addEventListener("click", () => {
        state.hourFilter = state.hourFilter === h ? null : h;
        renderExplore();
        hydrateShelves();
      });
      return bar;
    }),
  );
  const labels = document.createElement("div");
  labels.className = "hours-labels";
  for (const t of ["00h", "06h", "12h", "18h", "23h"]) {
    const s = document.createElement("span");
    s.textContent = t;
    labels.append(s);
  }
  hoursBox.append(hTitle, chart, labels);
  host.append(hoursBox);

  if (state.hourFilter != null) {
    const hourPlays = plays
      .filter((p) => new Date(p.timestamp).getHours() === state.hourFilter)
      .sort((a, b) => b.timestamp - a.timestamp);
    const box = document.createElement("div");
    box.className = "explore-box wide";
    const t = document.createElement("h3");
    t.textContent = `Reproducciones de las ${String(state.hourFilter).padStart(2, "0")}:00 (${hourPlays.length})`;
    box.append(t);
    if (hourPlays.length === 0)
      box.append(emptyBox("Nada en ese horario dentro del período."));
    else {
      const ul = document.createElement("ul");
      ul.className = "top-list";
      ul.append(
        ...hourPlays
          .slice(0, 20)
          .map((p, i) =>
            buildTrackRow(
              String(i + 1),
              p.artwork,
              p.title,
              `${p.artist} · ${formatTimeEs(p.timestamp)}`,
              formatClock(p.seconds || 0),
              { href: resolveVideoUrl(p) },
            ),
          ),
      );
      box.append(ul);
    }
    host.append(box);
  }

  const wdSec = new Array(7).fill(0);
  const wdPlays = new Array(7).fill(0);
  for (const p of plays) {
    const idx = (new Date(p.timestamp).getDay() + 6) % 7;
    wdSec[idx] += p.seconds || 0;
    wdPlays[idx] += 1;
  }
  const wdBox = document.createElement("div");
  wdBox.className = "explore-box wide";
  const wdTitle = document.createElement("h3");
  wdTitle.textContent = "Rendimiento por día de la semana";
  const wdChart = document.createElement("div");
  wdChart.className = "weekday-chart";
  const wdLabels = ["L", "M", "X", "J", "V", "S", "D"];
  const wdFull = [
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
    "Domingo",
  ];
  const maxWd = Math.max(...wdSec, 1);
  wdChart.append(
    ...wdSec.map((sec, i) => {
      const col = document.createElement("div");
      col.className = "wd-col";
      const bar = document.createElement("div");
      bar.className =
        sec === 0 ? "wd-bar zero" : sec === maxWd ? "wd-bar peak" : "wd-bar";
      bar.style.height =
        sec === 0 ? "4px" : `${Math.max(8, Math.round((sec / maxWd) * 100))}%`;
      tipify(
        bar,
        () => `${wdFull[i]}: ${formatDuration(sec)} (${wdPlays[i]} rep.)`,
      );
      const lbl = document.createElement("span");
      lbl.className = "wd-lbl";
      lbl.textContent = wdLabels[i];
      col.append(bar, lbl);
      return col;
    }),
  );
  wdBox.append(wdTitle, wdChart);
  host.append(wdBox);

  const chipsBox = document.createElement("div");
  chipsBox.className = "explore-box wide";
  const cTitle = document.createElement("h3");
  cTitle.textContent = "Formatos, origen e interacciones";
  const chips = document.createElement("div");
  chips.className = "breakdown-grid";
  chips.append(
    ...vm.chips.map(([label, val]) => {
      const d = document.createElement("div");
      d.className = "bd-chip";
      const sp = document.createElement("span");
      sp.textContent = label;
      const st = document.createElement("strong");
      st.textContent = String(val);
      d.append(sp, st);
      return d;
    }),
  );
  chipsBox.append(cTitle, chips);
  host.append(chipsBox);

  if (vm.catEntries.length) {
    const box = document.createElement("div");
    box.className = "explore-box wide";
    const t = document.createElement("h3");
    t.textContent = "Categorías / Géneros";
    const bars = document.createElement("div");
    bars.className = "cat-bars";
    bars.append(
      ...vm.catEntries.map((st) => {
        const row = document.createElement("div");
        row.className = "cat-row";
        const top = document.createElement("div");
        top.className = "cat-row-top";
        const lbl = document.createElement("span");
        lbl.textContent = translateCategory(st.cat);
        const m = document.createElement("span");
        m.textContent = `${st.pct}% · ${st.plays}x (${formatDuration(st.seconds)})`;
        top.append(lbl, m);
        const track = document.createElement("div");
        track.className = "cat-track";
        const fill = document.createElement("div");
        fill.className = "cat-fill";
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
    box.append(t, bars);
    host.append(box);
  }

  const listBox = document.createElement("div");
  listBox.className = "explore-box wide";
  const lt = document.createElement("h3");
  lt.textContent = "Top escuchado / visto";
  const ul = document.createElement("ul");
  ul.className = "top-list";
  ul.append(
    ...(sum.empty ? [] : sum.topTracks.slice(0, 15)).map((t, i) =>
      buildTrackRow(
        String(i + 1),
        t.artwork,
        t.title,
        t.artist,
        `${t.plays}x · ${t.seconds > 0 ? formatDuration(t.seconds) : "Imp."}`,
        { href: t.videoUrl || undefined },
      ),
    ),
  );
  listBox.append(lt, ul);
  host.append(listBox);
}

function renderCalendarRoute() {
  renderCalendarView({
    dom: domCal,
    uiState: calUi,
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

function renderPeople() {
  const host = els.routes.people;
  host.replaceChildren();
  host.append(
    routeTitle(state.scope === "music" ? "Tus artistas" : "Tus canales"),
  );
  if (state.scope === "music") {
    const vm = memoVM("activityPeople", () =>
      activityVM(
        periodPlays(),
        meta(store.interactions),
        meta(store.searches),
        [],
      ),
    );
    const box = document.createElement("div");
    box.className = "explore-box wide";
    const t = document.createElement("h3");
    t.textContent = "Artistas por tiempo escuchado";
    const ul = document.createElement("ul");
    ul.className = "top-list";
    ul.append(
      ...vm.topArtists.map((a, i) =>
        buildTrackRow(
          String(i + 1),
          a.artwork,
          a.name,
          `${a.plays} reproducciones`,
          formatDuration(a.seconds),
          { href: a.url || undefined, avatar: true },
        ),
      ),
    );
    box.append(t, ul);
    host.append(box);
    const all = memoVM("homePeople", () =>
      homeVM(periodPlays(), allPlays(), [], [], []),
    ).artists;
    if (all.length)
      host.append(
        shelf({
          title: "Explorar artistas",
          cardsFactory: () => peopleCards(all),
        }),
      );
    return;
  }
  const vm = vmChannels("time", 0);
  const stats = document.createElement("div");
  stats.className = "explore-grid";
  stats.append(
    statCard("Canales únicos", String(vm.unique)),
    statCard("Visitas a canales", String(vm.totalVisits)),
    statCard("Con tiempo reproducido", String(vm.withTime.length)),
  );
  host.append(stats);
  const box = document.createElement("div");
  box.className = "explore-box wide";
  const t = document.createElement("h3");
  t.textContent = "Ranking de canales";
  const ul = document.createElement("ul");
  ul.className = "top-list";
  ul.append(
    ...vm.ranked.map((ch, i) =>
      buildTrackRow(
        String(i + 1),
        ch.avatar,
        ch.name,
        ch.sub,
        ch.seconds > 0 ? formatDuration(ch.seconds) : `${ch.visits}x`,
        { href: ch.url || undefined, avatar: true, barPct: ch.barPct },
      ),
    ),
  );
  box.append(t, ul);
  host.append(box);
  if (vm.recent.length) {
    const rb = document.createElement("div");
    rb.className = "explore-box wide";
    const rt = document.createElement("h3");
    rt.textContent = "Últimas visitas a canales";
    const rul = document.createElement("ul");
    rul.className = "top-list";
    rul.append(
      ...vm.recent.map((v) =>
        buildTrackRow(
          "👁",
          v.avatar,
          v.name,
          relativeTime(v.timestamp),
          "Abrir ↗",
          { href: v.url || undefined, avatar: true },
        ),
      ),
    );
    rb.append(rt, rul);
    host.append(rb);
  }
}

function renderLikes() {
  const vm = vmLikes();
  const host = els.routes.likes;
  host.replaceChildren();
  host.append(routeTitle("Likes y actividad"));
  const stats = document.createElement("div");
  stats.className = "explore-grid";
  stats.append(
    statCard("Me gusta", `❤️ ${vm.likes.length}`),
    statCard("Suscripciones", `🔔 ${vm.subs.length}`),
    statCard("Búsquedas", `🔍 ${vm.searches.length}`),
  );
  host.append(stats);
  const mk = (title, items, renderer, empty) => {
    const box = document.createElement("div");
    box.className = "explore-box";
    const t = document.createElement("h3");
    t.textContent = title;
    box.append(t);
    if (items.length === 0) box.append(emptyBox(empty));
    else {
      const ul = document.createElement("ul");
      ul.className = "top-list";
      ul.append(...items.slice(0, 30).map(renderer));
      box.append(ul);
    }
    return box;
  };
  const cols = document.createElement("div");
  cols.className = "likes-cols";
  cols.append(
    mk(
      "Me gusta",
      vm.likes,
      renderInteractionRow,
      "Todavía no diste Me gusta en este período.",
    ),
    mk(
      "Suscripciones",
      vm.subs,
      renderInteractionRow,
      "Sin suscripciones nuevas en este período.",
    ),
  );
  host.append(cols);
  host.append(
    mk(
      "Búsquedas",
      vm.searches,
      renderSearchRow,
      "Sin búsquedas registradas en este período.",
    ),
  );
}

function renderResults() {
  const host = els.routes.results;
  host.replaceChildren();
  const vm = searchVM(state.q, scopeValue(), store);
  if (!vm) {
    host.append(
      routeTitle("Resultados"),
      emptyBox("Escribí algo en el buscador para ver resultados."),
    );
    return;
  }
  const total =
    vm.tracks.length +
    vm.artists.length +
    vm.channels.length +
    vm.searches.length;
  host.append(routeTitle(`Resultados para «${state.q}»`));
  if (total === 0) {
    host.append(
      emptyBox(`Sin resultados para «${state.q}» en ${scopeName()}.`),
    );
    return;
  }
  if (vm.tracks.length)
    host.append(
      shelf({
        title: "Temas y videos",
        cardsFactory: () => trackCards(vm.tracks, state.scope !== "music"),
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

function renderRoute() {
  for (const io of observers) io.disconnect();
  observers.clear();
  mountedRows.clear();
  pendingShelves.length = 0;
  hideTip();
  const savedTop = els.content.scrollTop;
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
  els.content.scrollTop = savedTop;
  if (state.lastRoute !== state.route || state.lastScope !== state.scope) {
    els.content.scrollTop = 0;
    const heading = els.routes[state.route].querySelector(".route-title");
    if (heading) heading.focus({ preventScroll: true });
    state.lastRoute = state.route;
    state.lastScope = state.scope;
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
}

// PATCH C: refresh por datos — rebuild solo si cambia la estructura;
// si solo cambian métricas, actualización in-place sin tocar shelves/grilla.
function refreshData() {
  const sigs = computeSigs();
  const prev = state.sigs;
  state.sigs = sigs;
  if (!prev || prev.struct !== sigs.struct) {
    const top = els.content.scrollTop;
    renderShell();
    renderRoute();
    els.content.scrollTop = top;
  } else if (prev.metrics !== sigs.metrics) {
    updateMetricsInPlace();
  }
}

// ---------- playerbar ----------
function renderPlayer() {
  const sel = npService.select(state.pinnedNpTabId);
  const np = sel?.primary || null;
  state.currentNp = np;
  state.currentTabId = np?.tabId ?? null;
  if (!np) {
    els.pbTitle.textContent = "Nada reproduciéndose ahora";
    els.pbArtist.textContent = "Abrí YouTube o YT Music en otra pestaña";
    els.pbThumb.removeAttribute("src");
    els.pbSource.hidden = true;
    els.pbLoopBadge.hidden = true;
    els.pbPinned.hidden = true;
    els.pbStale.hidden = true;
    els.pbTime.textContent = "0:00 / 0:00";
    els.pbSeek.value = 0;
    els.pbSeek.style.setProperty("--pb-fill", "0%");
    els.pbPlay.innerHTML = icon("play", 18);
    els.pbLike.innerHTML = icon("heart", 18);
    els.pbLike.classList.remove("on");
    els.mpTitle.textContent = "—";
    els.mpArtist.textContent = "—";
    els.mpFill.style.width = "0%";
    els.mpPlay.innerHTML = icon("play", 16);
    renderQueue([]);
    return;
  }
  if (np.artwork) {
    els.pbThumb.src = np.artwork;
    els.mpThumb.src = np.artwork;
  } else {
    els.pbThumb.removeAttribute("src");
    els.mpThumb.removeAttribute("src");
  }
  els.pbTitle.textContent = np.title;
  els.pbArtist.textContent = np.album
    ? `${np.artist} · ${np.album}`
    : np.artist;
  els.mpTitle.textContent = np.title;
  els.mpArtist.textContent = np.artist;
  els.pbSource.hidden = false;
  els.pbSource.textContent =
    np.source === "yt_music"
      ? "YT Music"
      : np.isMusic
        ? "YouTube · Música"
        : "YouTube";
  els.pbLoopBadge.hidden = !(np.loopActive || np.isLoopSession);
  els.pbPinned.hidden = state.pinnedNpTabId == null;
  els.pbStale.hidden = !(!np.paused && Date.now() - np.updatedAt > 90000);
  els.pbPlay.innerHTML = icon(np.paused ? "play" : "pause", 18);
  els.mpPlay.innerHTML = icon(np.paused ? "play" : "pause", 16);
  els.pbMute.innerHTML = icon(np.muted ? "mute" : "volume", 18);
  els.pbLoop.classList.toggle("on", Boolean(np.loopActive || np.isLoopSession));
  els.pbLike.innerHTML = icon(np.liked === true ? "heartFill" : "heart", 18);
  els.pbLike.classList.toggle("on", np.liked === true);
  els.pbLike.title =
    np.liked == null
      ? "Estado de like no disponible en esta pestaña"
      : np.liked
        ? "Quitar Me gusta"
        : "Dar Me gusta";
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
    els.mpFill.style.width = `${(pct * 100).toFixed(1)}%`;
  }
  els.pbTime.textContent =
    np.duration > 0
      ? `${formatClock(np.currentTime)} / ${formatClock(np.duration)}`
      : formatClock(np.currentTime);
  renderQueue(sel?.others || []);
}

function renderQueue(others) {
  if (els.queuePop.hidden) return;
  const nodes = [];
  const title = document.createElement("div");
  title.className = "queue-title";
  title.textContent = `Otras pestañas (${others.length})`;
  nodes.push(title);
  if (others.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-msg small";
    p.textContent = "No hay otras pestañas de YouTube abiertas.";
    nodes.push(p);
  }
  for (const tab of others) {
    const wrap = document.createElement("div");
    wrap.className = "queue-item";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "np-other-btn";
    const st = document.createElement("span");
    st.className = tab.paused ? "np-other-state" : "np-other-state playing";
    st.innerHTML = icon(tab.paused ? "pause" : "play", 12);
    const img = document.createElement("img");
    img.className = "np-other-thumb";
    if (tab.artwork) img.src = tab.artwork;
    img.alt = "";
    const meta = document.createElement("div");
    meta.className = "meta";
    const t = document.createElement("div");
    t.className = "np-other-title";
    t.textContent = tab.title;
    const s = document.createElement("div");
    s.className = "np-other-sub";
    s.textContent = `${tab.source === "yt_music" ? "YT Music" : tab.isMusic ? "YouTube · Música" : "YouTube"} · ${tab.artist}`;
    meta.append(t, s);
    const time = document.createElement("span");
    time.className = "np-other-time";
    time.textContent = formatClock(tab.currentTime);
    btn.append(st, img, meta, time);
    btn.addEventListener("click", () => {
      state.pinnedNpTabId = tab.storageKey || tab.tabId;
      renderPlayer();
    });
    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "queue-mini";
    playBtn.title = tab.paused
      ? "Reproducir en esa pestaña"
      : "Pausar esa pestaña";
    playBtn.innerHTML = icon(tab.paused ? "play" : "pause", 13);
    playBtn.addEventListener("click", () =>
      sendControl(tab.paused ? "play" : "pause", undefined, tab.tabId),
    );
    const pinBtn = document.createElement("button");
    pinBtn.type = "button";
    pinBtn.className =
      "queue-mini" +
      (state.pinnedNpTabId === (tab.storageKey || tab.tabId) ? " on" : "");
    pinBtn.title = "Pinear como principal";
    pinBtn.innerHTML = icon("pin", 13);
    pinBtn.addEventListener("click", () => {
      const key = tab.storageKey || tab.tabId;
      state.pinnedNpTabId = state.pinnedNpTabId === key ? null : key;
      renderPlayer();
    });
    const jumpBtn = document.createElement("button");
    jumpBtn.type = "button";
    jumpBtn.className = "queue-mini";
    jumpBtn.title = "Ir a esa pestaña";
    jumpBtn.innerHTML = icon("jump", 13);
    jumpBtn.addEventListener("click", () => jumpToTab(tab.tabId));
    wrap.append(btn, playBtn, pinBtn, jumpBtn);
    nodes.push(wrap);
  }
  els.queuePop.replaceChildren(...nodes);
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
  const nodes = [];
  const scopeLine = document.createElement("div");
  scopeLine.className = "search-scope";
  scopeLine.textContent = `Buscando en ${scopeName()}`;
  nodes.push(scopeLine);

  if (!q) {
    const recent = [];
    const seen = new Set();
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
    const t = document.createElement("div");
    t.className = "search-group-title";
    t.textContent = "Búsquedas recientes";
    nodes.push(t);
    if (recent.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-msg small";
      p.textContent = "Sin búsquedas recientes en esta página.";
      nodes.push(p);
    } else {
      const chips = document.createElement("div");
      chips.className = "search-chips";
      chips.append(
        ...recent.map((s) => {
          const c = document.createElement("button");
          c.type = "button";
          c.className = "search-chip";
          c.textContent = s.query;
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
      const t = document.createElement("div");
      t.className = "search-group-title";
      t.textContent = title;
      nodes.push(t);
      nodes.push(...items.map(make));
    };
    const hit = (artwork, name, title, sub, onOpen) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "search-hit";
      if (artwork) {
        const img = document.createElement("img");
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
      const meta = document.createElement("div");
      meta.className = "meta";
      const t = document.createElement("div");
      t.className = "t";
      t.append(highlight(title, q));
      const s = document.createElement("div");
      s.className = "s";
      s.textContent = sub;
      meta.append(t, s);
      b.append(meta);
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
      hit(a.artwork, a.name, a.name, `${a.plays} rep.`, () => openUrl(a.url)),
    );
    group("Canales", vm.channels.slice(0, 3), (v) =>
      hit(v.avatar, v.name, v.name, "Canal visitado", () => openUrl(v.url)),
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
    if (nodes.length === 1) {
      const p = document.createElement("p");
      p.className = "empty-msg small";
      p.textContent = "Sin coincidencias.";
      nodes.push(p);
    }
    const hint = document.createElement("div");
    hint.className = "search-kbd-hint";
    hint.textContent = "↑/↓ navegar · Enter abrir · Esc cerrar";
    nodes.push(hint);
  }
  els.searchDrop.replaceChildren(...nodes);
  els.searchDrop.hidden = false;
  els.globalSearch.setAttribute("aria-expanded", "true");
  state.searchIndex = -1;
}

// ---------- miniplayer drag ----------
function applyMiniPos() {
  try {
    const raw = localStorage.getItem("recapMiniPos");
    if (!raw) return;
    const { x, y } = JSON.parse(raw);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      els.miniplayer.classList.add("dragged");
      els.miniplayer.style.left = `${Math.min(Math.max(8, x), innerWidth - 310)}px`;
      els.miniplayer.style.top = `${Math.min(Math.max(8, y), innerHeight - 260)}px`;
    }
  } catch {
    // Ignorar
  }
}
function initMiniDrag() {
  let dragging = false;
  let offX = 0;
  let offY = 0;
  els.mpHead.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    dragging = true;
    const r = els.miniplayer.getBoundingClientRect();
    offX = e.clientX - r.left;
    offY = e.clientY - r.top;
    els.mpHead.setPointerCapture(e.pointerId);
    els.miniplayer.classList.add("dragged");
  });
  els.mpHead.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const x = Math.min(Math.max(8, e.clientX - offX), innerWidth - 310);
    const y = Math.min(Math.max(8, e.clientY - offY), innerHeight - 260);
    els.miniplayer.style.left = `${x}px`;
    els.miniplayer.style.top = `${y}px`;
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    const r = els.miniplayer.getBoundingClientRect();
    localStorage.setItem(
      "recapMiniPos",
      JSON.stringify({ x: r.left, y: r.top }),
    );
  };
  els.mpHead.addEventListener("pointerup", end);
  els.mpHead.addEventListener("pointercancel", end);
}

// ---------- eventos ----------
els.brandBtn.addEventListener("click", () => {
  const next = state.scope === "music" ? "youtube" : "music";
  navigate(next, state.perScopeRoute[next] || "home");
  toast(next === "music" ? "Página Music" : "Página YouTube sin música");
});
els.sideNav.querySelectorAll(".side-link").forEach((b) => {
  b.addEventListener("click", () => navigate(state.scope, b.dataset.route));
});
els.newPlaylistBtn.addEventListener("click", () => {
  const ids = aggregateTracks(periodPlays())
    .map((t) => t.videoId)
    .filter(Boolean)
    .slice(0, 50);
  if (ids.length === 0) {
    toast("No hay reproducciones con videoId en este período.");
    return;
  }
  openInstantPlaylist(ids);
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
  const nodes = searchHitNodes();
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
  if (!e.target.closest("#queuePop") && !e.target.closest("#pbQueue"))
    els.queuePop.hidden = true;
  if (!e.target.closest("#helpPop") && !e.target.closest("#helpBtn"))
    els.helpPop.hidden = true;
});

document.addEventListener("keydown", (e) => {
  const typing = /^(input|textarea|select)$/i.test(e.target.tagName);
  if (e.key === "Escape") {
    els.helpPop.hidden = true;
    els.queuePop.hidden = true;
    els.searchDrop.hidden = true;
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
    case "M":
      if (e.shiftKey) els.brandBtn.click();
      else sendControl("mute");
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
      els.pbQueue.click();
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
els.mpPlay.addEventListener("click", () => els.pbPlay.click());
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
els.pbJump.addEventListener("click", () => {
  if (state.currentTabId != null) jumpToTab(state.currentTabId);
  else toast("No hay pestaña activa.");
});
els.mpJump.addEventListener("click", () => els.pbJump.click());
els.mpThumb.addEventListener("dblclick", () => els.pbJump.click());

els.pbSeek.addEventListener("input", () => {
  state.seeking = true;
  const np = state.currentNp;
  const pct = Number(els.pbSeek.value) / 10;
  els.pbSeek.style.setProperty("--pb-fill", `${pct}%`);
  if (np?.duration > 0) {
    const secs = (Number(els.pbSeek.value) / 1000) * np.duration;
    els.pbTime.textContent = `${formatClock(secs)} / ${formatClock(np.duration)}`;
  }
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

els.pbQueue.addEventListener("click", () => {
  const open = els.queuePop.hidden;
  els.queuePop.hidden = !open;
  if (open) {
    els.miniplayer.hidden = true;
    renderPlayer();
  }
});
els.miniToggleBtn.addEventListener("click", () => {
  const open = els.miniplayer.hidden;
  els.miniplayer.hidden = !open;
  if (open) {
    els.queuePop.hidden = true;
    applyMiniPos();
    renderPlayer();
  }
});
els.mpClose.addEventListener("click", () => {
  els.miniplayer.hidden = true;
});
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
    await chrome.storage.local.set(updatedData);
    Object.assign(store, updatedData);
    if (migrateMusicFlags(store)) await persistMusicFlags(store);
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
    toast("✓ ZIP exportado con datos, tarjeta PNG e imágenes.");
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
  const empty = emptyStore();
  await chrome.storage.local.set(empty);
  Object.assign(store, empty);
  renderAll();
  toast("✓ Historial local borrado.");
});

chrome.tabs.onRemoved.addListener((tabId) => {
  npService.removeTab(tabId);
  renderPlayer();
});

// PATCH C: debounce mayor (1200ms) + refresh granular por firmas.
let dataTimer = null;
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  const { npChanged, needSync, dataChanged, updates } =
    npService.applyChanges(changes);
  if (needSync) await npService.sync();
  if (npChanged) renderPlayer();
  if (dataChanged) {
    Object.assign(store, updates);
    if (dataTimer) clearTimeout(dataTimer);
    dataTimer = setTimeout(refreshData, 1200);
  }
});

window.addEventListener("resize", () => {
  hideTip();
  mountedRows.forEach((fn) => fn());
  if (!els.miniplayer.hidden) applyMiniPos();
});

// ---------- PATCH C: cleanup explícito ----------
let playerInterval = null;
function cleanup() {
  if (playerInterval) clearInterval(playerInterval);
  if (dataTimer) clearTimeout(dataTimer);
  if (searchTimer) clearTimeout(searchTimer);
  if (volTimer) clearTimeout(volTimer);
  if (toastTimer) clearTimeout(toastTimer);
  if (toastGapTimer) clearTimeout(toastGapTimer);
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
  const hero = document.createElement("div");
  hero.className = "hero";
  const l = document.createElement("div");
  l.className = "skel-line";
  l.style.width = "260px";
  l.style.height = "26px";
  hero.append(l);
  host.append(hero);
  for (let i = 0; i < 2; i++) {
    const sec = document.createElement("section");
    sec.className = "shelf";
    const row = document.createElement("div");
    row.className = "shelf-row";
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
  bindCalendarControls(domCal, calUi, renderCalendarRoute);
  domCal.calMonthImgBtn.addEventListener("click", () =>
    exportPngCard(calUi.monthCardData, domCal.calMonthImgBtn),
  );
  domCal.calMonthPlaylistBtn.addEventListener("click", () =>
    openInstantPlaylist(calUi.monthTopVideoIds),
  );
  initMiniDrag();

  parseHash();
  if (!location.hash)
    location.hash = `#/${state.scope}/${state.perScopeRoute[state.scope] || "home"}`;

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
  playerInterval = setInterval(renderPlayer, 3000);

  if (urlParams.get("import") === "1") {
    toast(
      "Modo completo abierto: tocá «Importar» para elegir tu archivo .zip o .json.",
    );
  }
}

init();
