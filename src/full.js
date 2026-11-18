// src/full.js
import {
  translateCategory,
  toDateKey,
  resolveVideoUrl,
  openInstantPlaylist,
  formatClock,
  formatDuration,
  formatShortDateTime,
  matchesFilter,
  matchesPeriodAndSourceOnly,
  aggregateTracks,
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
  period: localStorage.getItem("recapFullPeriod") || "30",
  q: "",
  pinnedNpTabId: null,
  currentTabId: null,
  currentNp: null,
  seeking: false,
};

const store = emptyStore();
const npService = new NowPlaying();

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
  miniToggleBtn: $("miniToggleBtn"),
  periodChips: $("periodChips"),
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
  pbMute: $("pbMute"),
  pbVol: $("pbVol"),
  pbLoop: $("pbLoop"),
  pbShuffle: $("pbShuffle"),
  pbQueue: $("pbQueue"),
  pbJump: $("pbJump"),
  miniplayer: $("miniplayer"),
  mpClose: $("mpClose"),
  mpThumb: $("mpThumb"),
  mpTitle: $("mpTitle"),
  mpArtist: $("mpArtist"),
  mpFill: $("mpFill"),
  mpPlay: $("mpPlay"),
  mpJump: $("mpJump"),
  queuePop: $("queuePop"),
  toast: $("toast"),
  enrichMusicBtn: $("enrichMusicBtn"),
  clearBtn: $("clearBtn"),
  confirmClearDialog: $("confirmClearDialog"),
  cancelClearBtn: $("cancelClearBtn"),
  confirmClearBtn: $("confirmClearBtn"),
};

// ---------- utilidades de vista ----------
let toastTimer = null;
function toast(msg, isError = false) {
  els.toast.textContent = msg;
  els.toast.classList.toggle("error", isError);
  els.toast.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (els.toast.hidden = true), 4000);
}

function scopeValue() {
  return state.scope === "music" ? "yt_music" : "youtube";
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
async function sendControl(action, value) {
  if (state.currentTabId == null) {
    toast("No hay ninguna pestaña de YouTube activa.");
    return;
  }
  try {
    const res = await chrome.tabs.sendMessage(state.currentTabId, {
      type: "RECAP_CONTROL",
      action,
      value,
    });
    if (!res?.ok) toast("Esa acción no está disponible en esta pestaña.");
  } catch {
    toast("La pestaña ya no está disponible.", true);
  }
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
  localStorage.setItem("recapFullScope", scope);
  const hash = `#/${scope}/${route}`;
  if (location.hash !== hash) location.hash = hash;
  else renderAll();
}
window.addEventListener("hashchange", () => {
  parseHash();
  renderAll();
});

// ---------- shell ----------
function renderShell() {
  document.body.dataset.scope = state.scope;
  document.title =
    state.scope === "music" ? "Recap · Music" : "Recap · YouTube";
  els.brandWord.textContent = state.scope === "music" ? "Music" : "YouTube";
  els.brandBtn.title =
    state.scope === "music"
      ? "Cambiar a YouTube sin música"
      : "Cambiar a Music";
  els.brandBtn.setAttribute("aria-label", els.brandBtn.title);
  els.peopleLabel.textContent =
    state.scope === "music" ? "Artistas" : "Canales";
  els.sideNav.querySelectorAll(".side-link").forEach((b) => {
    b.classList.toggle("active", b.dataset.route === state.route);
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
  renderSideLists();
}

function renderSideLists() {
  const vm = homeVM(
    periodPlays(),
    allPlays(),
    meta(store.interactions),
    meta(store.searches),
    meta(store.channelVisits),
  );
  const nodes = [];
  const liked = meta(store.interactions).filter((it) => it.type === "like");
  const likedBtn = document.createElement("button");
  likedBtn.type = "button";
  likedBtn.className = "side-list";
  likedBtn.innerHTML = "";
  const lt = document.createElement("strong");
  lt.textContent = "❤ Liked Music";
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

// ---------- shelves ----------
function makeCard({ kind, artwork, title, sub, stat, href, onOpen, month }) {
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
    cover.append(img);
  } else {
    const na = document.createElement("span");
    na.className = "no-art";
    na.textContent = kind === "round" ? "◉" : "♪";
    cover.append(na);
  }
  if (href || onOpen) {
    const play = document.createElement("span");
    play.className = "card-play";
    play.setAttribute("aria-hidden", "true");
    play.textContent = "▶";
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
  card.addEventListener("click", () => {
    if (onOpen) onOpen();
    else openUrl(href);
  });
  return card;
}

function shelf({ eyebrow, title, cards, moreRoute, avatar }) {
  const sec = document.createElement("section");
  sec.className = "shelf";
  const head = document.createElement("div");
  head.className = "shelf-head";
  if (avatar) {
    const hero = document.createElement("div");
    hero.className = "home-hero";
    const img = document.createElement("img");
    img.className = "home-avatar";
    img.src = avatar;
    img.alt = "";
    const txt = document.createElement("div");
    txt.className = "home-hero-text";
    const eb = document.createElement("span");
    eb.className = "shelf-eyebrow";
    eb.textContent = eyebrow || "";
    const ti = document.createElement("span");
    ti.className = "shelf-title";
    ti.textContent = title;
    txt.append(eb, ti);
    hero.append(img, txt);
    head.append(hero);
  } else {
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
  }
  const tools = document.createElement("div");
  tools.className = "shelf-tools";
  if (moreRoute) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "shelf-more";
    more.textContent = "More";
    more.addEventListener("click", () => navigate(state.scope, moreRoute));
    tools.append(more);
  }
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "shelf-arrow";
  prev.setAttribute("aria-label", "Desplazar a la izquierda");
  prev.textContent = "‹";
  const next = document.createElement("button");
  next.type = "button";
  next.className = "shelf-arrow";
  next.setAttribute("aria-label", "Desplazar a la derecha");
  next.textContent = "›";
  tools.append(prev, next);
  head.append(tools);

  const row = document.createElement("div");
  row.className = "shelf-row";
  row.append(...cards);
  const updateArrows = () => {
    prev.disabled = row.scrollLeft <= 4;
    next.disabled = row.scrollLeft + row.clientWidth >= row.scrollWidth - 4;
  };
  prev.addEventListener("click", () => {
    row.scrollBy({ left: -row.clientWidth * 0.8, behavior: "smooth" });
  });
  next.addEventListener("click", () => {
    row.scrollBy({ left: row.clientWidth * 0.8, behavior: "smooth" });
  });
  row.addEventListener("scroll", updateArrows, { passive: true });
  requestAnimationFrame(updateArrows);
  sec.append(head, row);
  return sec;
}

function trackCards(tracks, wide = false) {
  return tracks.map((t) =>
    makeCard({
      kind: wide ? "wide" : "square",
      artwork: t.artwork,
      title: t.title,
      sub: t.artist,
      stat: `${t.plays}x · ${t.seconds > 0 ? formatDuration(t.seconds) : "importado"}`,
      href: t.videoUrl || resolveVideoUrl(t),
    }),
  );
}

function emptyBox(msg) {
  const p = document.createElement("p");
  p.className = "empty-msg";
  p.textContent = msg;
  return p;
}

// ---------- rutas ----------
function renderHome() {
  const plays = periodPlays();
  const vm = homeVM(
    plays,
    allPlays(),
    metaAll(store.interactions),
    metaAll(store.searches),
    metaAll(store.channelVisits),
  );
  const host = els.routes.home;
  host.replaceChildren();
  if (plays.length === 0 && vm.recent.length === 0) {
    host.append(
      emptyBox(
        "Todavía no hay datos en este período. Reproducí al menos 20 segundos en YouTube o YT Music y volvé.",
      ),
    );
    return;
  }
  const topArtistArt = vm.artists[0]?.artwork || "";
  if (state.scope === "music") {
    if (vm.top.length)
      host.append(
        shelf({
          eyebrow: "Tu recap",
          title: "Listen again",
          avatar: topArtistArt,
          cards: trackCards(vm.top),
          moreRoute: "explore",
        }),
      );
    if (vm.forgotten.length)
      host.append(
        shelf({
          title: "Forgotten favorites",
          cards: trackCards(vm.forgotten),
        }),
      );
    if (vm.artists.length)
      host.append(
        shelf({
          title: "Tus artistas",
          cards: vm.artists.map((a) =>
            makeCard({
              kind: "round",
              artwork: a.artwork,
              title: a.name,
              sub: `${a.plays} reproducciones`,
              stat: formatDuration(a.seconds),
              href: a.url || undefined,
              onOpen: a.url
                ? undefined
                : () => {
                    state.q = a.name;
                    els.globalSearch.value = a.name;
                    navigate(state.scope, "results");
                  },
            }),
          ),
          moreRoute: "people",
        }),
      );
    if (vm.albums.length)
      host.append(
        shelf({
          title: "Álbumes",
          cards: vm.albums.map((a) =>
            makeCard({
              artwork: a.artwork,
              title: a.album,
              sub: a.artist,
              stat: `${a.plays}x · ${formatDuration(a.seconds)}`,
            }),
          ),
        }),
      );
  } else {
    if (vm.recent.length)
      host.append(
        shelf({
          eyebrow: "Tu recap",
          title: "Seguir viendo",
          cards: vm.recent.map((p) =>
            makeCard({
              kind: "wide",
              artwork: p.artwork,
              title: p.title,
              sub: p.artist,
              stat: formatShortDateTime(p.timestamp),
              href: resolveVideoUrl(p),
            }),
          ),
          moreRoute: "explore",
        }),
      );
    if (vm.top.length)
      host.append(
        shelf({ title: "Top del período", cards: trackCards(vm.top, true) }),
      );
    if (vm.channels.length)
      host.append(
        shelf({
          title: "Tus canales",
          cards: vm.channels.map((c) =>
            makeCard({
              kind: "round",
              artwork: c.artwork,
              title: c.name,
              sub: `${c.plays} rep.`,
              stat: c.seconds > 0 ? formatDuration(c.seconds) : "visitas",
              href: c.url || undefined,
            }),
          ),
          moreRoute: "people",
        }),
      );
    if (vm.shorts.length)
      host.append(
        shelf({
          title: "Shorts",
          cards: vm.shorts.map((p) =>
            makeCard({
              artwork: p.artwork,
              title: p.title,
              sub: p.artist,
              stat: formatClock(p.seconds || 0),
              href: resolveVideoUrl(p),
            }),
          ),
        }),
      );
    if (vm.lives.length)
      host.append(
        shelf({
          title: "Directos",
          cards: vm.lives.map((p) =>
            makeCard({
              kind: "wide",
              artwork: p.artwork,
              title: p.title,
              sub: p.artist,
              stat: formatDuration(p.seconds || 0),
              href: resolveVideoUrl(p),
            }),
          ),
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
        cards: monthCards,
        moreRoute: "calendar",
      }),
    );
  if (vm.recentSearches.length)
    host.append(
      shelf({
        title: "Búsquedas recientes",
        cards: vm.recentSearches.map((s) =>
          makeCard({
            title: s.query,
            sub: s.source === "yt_music" ? "YT Music" : "YouTube",
            stat: formatShortDateTime(s.timestamp),
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
  const vm = activityVM(
    plays,
    meta(store.interactions),
    meta(store.searches),
    store.skips.filter((it) =>
      matchesFilter(it, state.period, scopeValue(), true),
    ),
  );
  const sum = summaryVM(plays);
  const host = els.routes.explore;
  host.replaceChildren();

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
  hTitle.textContent = "Actividad por hora del día";
  const chart = document.createElement("div");
  chart.className = "hours-chart";
  chart.append(
    ...vm.hours.map((sec, h) => {
      const bar = document.createElement("div");
      bar.className = sec === 0 ? "hour-bar zero" : "hour-bar";
      const pct =
        vm.maxHour > 0 ? Math.max(5, Math.round((sec / vm.maxHour) * 100)) : 5;
      bar.style.height = sec === 0 ? "4px" : `${pct}%`;
      bar.title = `${String(h).padStart(2, "0")}:00 — ${formatDuration(sec)}`;
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
  if (state.scope === "music") {
    const vm = activityVM(
      periodPlays(),
      meta(store.interactions),
      meta(store.searches),
      [],
    );
    const box = document.createElement("div");
    box.className = "explore-box wide";
    const t = document.createElement("h3");
    t.textContent = "Tus artistas por tiempo escuchado";
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
    const all = homeVM(periodPlays(), allPlays(), [], [], []).artists;
    if (all.length) {
      host.append(
        shelf({
          title: "Explorar artistas",
          cards: all.map((a) =>
            makeCard({
              kind: "round",
              artwork: a.artwork,
              title: a.name,
              sub: `${a.plays} rep.`,
              stat: formatDuration(a.seconds),
              href: a.url || undefined,
            }),
          ),
        }),
      );
    }
    return;
  }
  const vm = channelsVM(meta(store.channelVisits), periodPlays(), "time", 0);
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
          formatShortDateTime(v.timestamp),
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
  const vm = likesVM(meta(store.interactions), meta(store.searches));
  const host = els.routes.likes;
  host.replaceChildren();
  const stats = document.createElement("div");
  stats.className = "explore-grid";
  stats.append(
    statCard("Me gusta", `❤️ ${vm.likes.length}`),
    statCard("Suscripciones", `🔔 ${vm.subs.length}`),
    statCard("Búsquedas", `🔍 ${vm.searches.length}`),
  );
  host.append(stats);
  const cols = document.createElement("div");
  cols.className = "likes-cols";
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
    host.append(emptyBox("Escribí algo en el buscador para ver resultados."));
    return;
  }
  const total =
    vm.tracks.length +
    vm.artists.length +
    vm.channels.length +
    vm.searches.length;
  if (total === 0) {
    host.append(emptyBox(`Sin resultados para «${state.q}» en esta página.`));
    return;
  }
  const head = document.createElement("div");
  head.className = "shelf-head";
  const t = document.createElement("h2");
  t.className = "shelf-title";
  t.textContent = `Resultados para «${state.q}»`;
  head.append(t);
  host.append(head);
  if (vm.tracks.length)
    host.append(
      shelf({
        title: "Temas y videos",
        cards: trackCards(vm.tracks, state.scope !== "music"),
      }),
    );
  if (vm.artists.length)
    host.append(
      shelf({
        title: "Artistas / canales",
        cards: vm.artists.map((a) =>
          makeCard({
            kind: "round",
            artwork: a.artwork,
            title: a.name,
            sub: `${a.plays} rep.`,
            stat: formatDuration(a.seconds),
            href: a.url || undefined,
          }),
        ),
      }),
    );
  if (vm.channels.length)
    host.append(
      shelf({
        title: "Canales visitados",
        cards: vm.channels.map((v) =>
          makeCard({
            kind: "round",
            artwork: v.avatar,
            title: v.name,
            sub: formatShortDateTime(v.timestamp),
            href: v.url,
          }),
        ),
      }),
    );
  if (vm.searches.length)
    host.append(
      shelf({
        title: "Búsquedas",
        cards: vm.searches.map((s) =>
          makeCard({
            title: s.query,
            sub: s.source === "yt_music" ? "YT Music" : "YouTube",
            stat: formatShortDateTime(s.timestamp),
            href: s.url,
          }),
        ),
      }),
    );
}

function renderRoute() {
  for (const [key, node] of Object.entries(els.routes)) {
    node.hidden = key !== state.route;
  }
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
}

function renderAll() {
  renderShell();
  renderRoute();
  renderPlayer();
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
    els.pbTime.textContent = "0:00 / 0:00";
    els.pbSeek.value = 0;
    els.pbPlay.textContent = "▶";
    els.mpTitle.textContent = "—";
    els.mpArtist.textContent = "—";
    els.mpFill.style.width = "0%";
    els.mpPlay.textContent = "▶";
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
  els.pbPlay.textContent = np.paused ? "▶" : "⏸";
  els.mpPlay.textContent = np.paused ? "▶" : "⏸";
  els.pbMute.textContent = np.muted ? "🔇" : "🔊";
  els.pbLoop.classList.toggle("on", Boolean(np.loopActive || np.isLoopSession));
  if (!state.seeking) {
    els.pbVol.value = Math.round((np.muted ? 0 : (np.volume ?? 1)) * 100);
    const pct = np.duration > 0 ? np.currentTime / np.duration : 0;
    els.pbSeek.value = Math.round(pct * 1000);
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
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "np-other-btn";
    const st = document.createElement("span");
    st.className = tab.paused ? "np-other-state" : "np-other-state playing";
    st.textContent = tab.paused ? "⏸" : "▶";
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
    nodes.push(btn);
  }
  els.queuePop.replaceChildren(...nodes);
}

// ---------- eventos ----------
els.brandBtn.addEventListener("click", () => {
  const next = state.scope === "music" ? "youtube" : "music";
  const route = state.route === "results" ? "home" : state.route;
  navigate(next, route);
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
    const q = els.globalSearch.value.trim();
    state.q = q;
    if (!q) {
      els.searchDrop.hidden = true;
      return;
    }
    const vm = searchVM(q, scopeValue(), store);
    const nodes = [];
    const group = (title, items, make) => {
      if (!items.length) return;
      const t = document.createElement("div");
      t.className = "search-group-title";
      t.textContent = title;
      nodes.push(t);
      nodes.push(...items.map(make));
    };
    const hit = (artwork, title, sub, onOpen) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "search-hit";
      if (artwork) {
        const img = document.createElement("img");
        img.src = artwork;
        img.alt = "";
        b.append(img);
      }
      const meta = document.createElement("div");
      meta.className = "meta";
      const t = document.createElement("div");
      t.className = "t";
      t.textContent = title;
      const s = document.createElement("div");
      s.className = "s";
      s.textContent = sub;
      meta.append(t, s);
      b.append(meta);
      b.addEventListener("click", () => {
        els.searchDrop.hidden = true;
        onOpen();
      });
      return b;
    };
    group("Temas", vm.tracks.slice(0, 4), (t) =>
      hit(t.artwork, t.title, t.artist, () => openUrl(t.videoUrl)),
    );
    group("Artistas", vm.artists.slice(0, 3), (a) =>
      hit(a.artwork, a.name, `${a.plays} rep.`, () => openUrl(a.url)),
    );
    group("Canales", vm.channels.slice(0, 3), (v) =>
      hit(v.avatar, v.name, "Canal visitado", () => openUrl(v.url)),
    );
    group("Búsquedas", vm.searches.slice(0, 3), (s) =>
      hit("", s.query, s.source === "yt_music" ? "YT Music" : "YouTube", () =>
        openUrl(s.url),
      ),
    );
    if (nodes.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-msg small";
      p.textContent = "Sin coincidencias.";
      nodes.push(p);
    }
    els.searchDrop.replaceChildren(...nodes);
    els.searchDrop.hidden = false;
  }, 200);
});
els.globalSearch.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    state.q = els.globalSearch.value.trim();
    els.searchDrop.hidden = true;
    navigate(state.scope, "results");
  } else if (e.key === "Escape") {
    els.searchDrop.hidden = true;
  }
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-wrap")) els.searchDrop.hidden = true;
  if (!e.target.closest("#queuePop") && !e.target.closest("#pbQueue")) {
    els.queuePop.hidden = true;
  }
});

document.addEventListener("keydown", (e) => {
  const typing = /^(input|textarea|select)$/i.test(e.target.tagName);
  if (!typing && (e.key === "m" || e.key === "M")) {
    els.brandBtn.click();
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
els.pbJump.addEventListener("click", () => {
  if (state.currentTabId != null) jumpToTab(state.currentTabId);
  else toast("No hay pestaña activa.");
});
els.mpJump.addEventListener("click", () => els.pbJump.click());

els.pbSeek.addEventListener("input", () => {
  state.seeking = true;
  const np = state.currentNp;
  if (np?.duration > 0) {
    const secs = (Number(els.pbSeek.value) / 1000) * np.duration;
    els.pbTime.textContent = `${formatClock(secs)} / ${formatClock(np.duration)}`;
  }
});
els.pbSeek.addEventListener("change", () => {
  const np = state.currentNp;
  state.seeking = false;
  if (np?.duration > 0) {
    sendControl("seek", (Number(els.pbSeek.value) / 1000) * np.duration);
  }
});
let volTimer = null;
els.pbVol.addEventListener("input", () => {
  if (volTimer) clearTimeout(volTimer);
  volTimer = setTimeout(
    () => sendControl("volume", Number(els.pbVol.value) / 100),
    120,
  );
});

els.pbQueue.addEventListener("click", () => {
  els.queuePop.hidden = !els.queuePop.hidden;
  if (!els.queuePop.hidden) renderPlayer();
});
els.miniToggleBtn.addEventListener("click", () => {
  els.miniplayer.hidden = !els.miniplayer.hidden;
  if (!els.miniplayer.hidden) renderPlayer();
});
els.mpClose.addEventListener("click", () => {
  els.miniplayer.hidden = true;
});

els.importBtn.addEventListener("click", () => {
  if (urlParams.get("import") === "1") {
    toast("Elegí tu archivo .zip o .json con el botón Importar.");
  }
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
  const orig = els.exportBtn.textContent;
  els.exportBtn.disabled = true;
  els.exportBtn.textContent = "⏳...";
  try {
    const sum = summaryVM(periodPlays());
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
    els.exportBtn.textContent = orig;
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
    dataTimer = setTimeout(renderAll, 250);
  }
});

// ---------- init ----------
async function init() {
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

  parseHash();
  if (!location.hash) {
    location.hash = `#/${state.scope}/home`;
  }

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
  setInterval(renderPlayer, 3000);

  if (urlParams.get("import") === "1") {
    toast(
      "Modo completo abierto: tocá «Importar» para elegir tu archivo .zip o .json.",
    );
  }
}

init();
