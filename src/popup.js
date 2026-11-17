import {
  translateCategory,
  toDateKey,
  resolveVideoUrl,
  openInstantPlaylist,
  formatClock,
  formatDuration,
  formatShortDateTime,
  computeStreak,
  matchesFilter,
  matchesPeriodAndSourceOnly,
  aggregateTracks,
  getGroupKey,
  sanitizeFileSlug,
  getExtFromMime,
} from "./utils.js";
import { buildZipBlob, extractJsonFromZipBuffer } from "./zip.js";
import { importBackupPayload } from "./takeout.js";
import { renderRecapPngBlob } from "./cardRenderer.js";

const $ = (id) => document.getElementById(id);

const urlParams = new URLSearchParams(location.search);
const isFullMode = urlParams.get("full") === "1";
if (isFullMode) document.body.classList.add("full-mode");

const dom = {
  periodSelect: $("periodSelect"),
  sourceSelect: $("sourceSelect"),
  expandBtn: $("expandBtn"),
  importBtn: $("importBtn"),
  importInput: $("importInput"),
  exportBtn: $("exportBtn"),
  statusBanner: $("statusBanner"),
  clearBtn: $("clearBtn"),

  npEmpty: $("npEmpty"),
  npContent: $("npContent"),
  npThumb: $("npThumb"),
  npStatusBadge: $("npStatusBadge"),
  npSourceBadge: $("npSourceBadge"),
  npCategoryBadge: $("npCategoryBadge"),
  npFormatBadge: $("npFormatBadge"),
  npLoopBadge: $("npLoopBadge"),
  npTitle: $("npTitle"),
  npArtist: $("npArtist"),
  npBarFill: $("npBarFill"),
  npTime: $("npTime"),
  npCountState: $("npCountState"),

  totalTime: $("totalTime"),
  totalPlays: $("totalPlays"),
  totalLoops: $("totalLoops"),
  uniqueCount: $("uniqueCount"),
  streakDays: $("streakDays"),
  peakHour: $("peakHour"),
  exportImgBtn: $("exportImgBtn"),
  makePlaylistBtn: $("makePlaylistBtn"),
  topList: $("topList"),
  emptyMsg: $("emptyMsg"),

  recentList: $("recentList"),
  recentEmpty: $("recentEmpty"),

  categoriesBox: $("categoriesBox"),
  categoriesList: $("categoriesList"),
  hoursChart: $("hoursChart"),
  breakdownStats: $("breakdownStats"),
  searchesBox: $("searchesBox"),
  topSearchesList: $("topSearchesList"),
  albumsBox: $("albumsBox"),
  topAlbumsList: $("topAlbumsList"),
  topArtistsList: $("topArtistsList"),
  skipsBox: $("skipsBox"),
  topSkipsList: $("topSkipsList"),

  calMonthLabel: $("calMonthLabel"),
  calPrevBtn: $("calPrevBtn"),
  calNextBtn: $("calNextBtn"),
  calTodayBtn: $("calTodayBtn"),
  calGrid: $("calGrid"),
  calDayTitle: $("calDayTitle"),
  calDayList: $("calDayList"),
  calDayEmpty: $("calDayEmpty"),
  calMonthTopTitle: $("calMonthTopTitle"),
  calMonthImgBtn: $("calMonthImgBtn"),
  calMonthPlaylistBtn: $("calMonthPlaylistBtn"),
  calMonthTopList: $("calMonthTopList"),
  calMonthTopEmpty: $("calMonthTopEmpty"),
  calMonthSocialBox: $("calMonthSocialBox"),
  calMonthSocialTitle: $("calMonthSocialTitle"),
  calMonthSocialList: $("calMonthSocialList"),
  calWeeksTitle: $("calWeeksTitle"),
  calWeeksList: $("calWeeksList"),

  chUniqueCount: $("chUniqueCount"),
  chTotalVisits: $("chTotalVisits"),
  chNewSubs: $("chNewSubs"),
  channelsTopList: $("channelsTopList"),
  channelsEmpty: $("channelsEmpty"),
  channelsRecentList: $("channelsRecentList"),
  channelsRecentEmpty: $("channelsRecentEmpty"),

  lkTotalLikes: $("lkTotalLikes"),
  lkTotalSubs: $("lkTotalSubs"),
  lkTotalSearches: $("lkTotalSearches"),
  likesList: $("likesList"),
  likesEmpty: $("likesEmpty"),
  subsList: $("subsList"),
  subsEmpty: $("subsEmpty"),
  socialSearchesList: $("socialSearchesList"),
  socialSearchesEmpty: $("socialSearchesEmpty"),
};

if (isFullMode) dom.expandBtn.hidden = true;

const nowInit = new Date();
const uiState = {
  activeTab: "summary",
  dirtyTabs: new Set([
    "summary",
    "recent",
    "activity",
    "calendar",
    "channels",
    "likes",
  ]),
  calYear: nowInit.getFullYear(),
  calMonth: nowInit.getMonth(),
  selectedDateKey: toDateKey(nowInit),
  recentMode: "plays",
  calDayMode: "all",
  topVideoIds: [],
  monthTopVideoIds: [],
  summaryCardData: null,
  monthCardData: null,
};

const store = {
  history: [],
  channelVisits: [],
  skips: [],
  interactions: [],
  searches: [],
};

const npTabsMap = new Map();

let statusTimer = null;
function showStatus(msg, isError = false) {
  dom.statusBanner.textContent = msg;
  dom.statusBanner.classList.toggle("error", isError);
  dom.statusBanner.hidden = false;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    dom.statusBanner.hidden = true;
  }, 6000);
}

// --- COMPONENTES DE FILA REUTILIZABLES ---
function buildTrackRow(
  rankText,
  artwork,
  titleText,
  subText,
  rightText,
  opts = {},
) {
  const li = document.createElement("li");
  li.className = opts.href ? "top-item clickable" : "top-item";

  const rank = document.createElement("span");
  rank.className = "rank";
  rank.textContent = rankText;

  const img = document.createElement("img");
  img.className = opts.avatar ? "thumb avatar" : "thumb";
  if (artwork) img.src = artwork;
  img.alt = "";

  const meta = document.createElement("div");
  meta.className = "meta";

  const title = document.createElement("div");
  title.className = "track-title";
  title.textContent = titleText;

  const sub = document.createElement("div");
  sub.className = "track-sub";
  sub.textContent = subText;

  meta.append(title, sub);

  const stats = document.createElement("div");
  stats.className = "track-stats";
  stats.textContent = rightText;

  if (opts.href) {
    const a = document.createElement("a");
    a.className = "item-link";
    a.href = opts.href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.append(rank, img, meta, stats);
    li.append(a);
  } else {
    li.append(rank, img, meta, stats);
  }

  return li;
}

function renderInteractionRow(it) {
  const isLike = it.type === "like";
  const cat =
    isLike && it.category ? ` · ${translateCategory(it.category)}` : "";
  return buildTrackRow(
    isLike ? "❤️" : "🔔",
    it.artwork,
    it.title,
    `${isLike ? it.artist : "Suscripción nueva"} · ${formatShortDateTime(it.timestamp)}${cat}`,
    isLike ? "Abrir ↗" : "Canal ↗",
    {
      href: (isLike ? it.videoUrl : it.channelUrl) || undefined,
      avatar: !isLike,
    },
  );
}

function renderSearchRow(s) {
  const src = s.source === "yt_music" ? "YT Music" : "YouTube";
  return buildTrackRow(
    "🔍",
    "",
    s.query,
    `${src} · ${formatShortDateTime(s.timestamp)}`,
    "Buscar ↗",
    {
      href: s.url || undefined,
    },
  );
}

// --- TARJETA EN VIVO (MULTI-PESTAÑA) ---
function renderNowPlaying(np) {
  if (!np) {
    dom.npEmpty.hidden = false;
    dom.npContent.hidden = true;
    return;
  }

  dom.npEmpty.hidden = true;
  dom.npContent.hidden = false;

  if (np.artwork) dom.npThumb.src = np.artwork;
  else dom.npThumb.removeAttribute("src");

  dom.npStatusBadge.textContent = np.paused ? "⏸ En pausa" : "● En vivo";
  dom.npStatusBadge.classList.toggle("paused", np.paused);
  dom.npSourceBadge.textContent =
    np.source === "yt_music" ? "YT Music" : "YouTube";

  if (np.category) {
    dom.npCategoryBadge.textContent = translateCategory(np.category);
    dom.npCategoryBadge.hidden = false;
  } else {
    dom.npCategoryBadge.hidden = true;
  }

  const fmtLabels = { short: "Short", live: "En vivo", mix: "Mix" };
  const fmtText =
    fmtLabels[np.contentType] || (np.context === "mix" ? "Mix" : "");
  dom.npFormatBadge.hidden = !fmtText;
  if (fmtText) dom.npFormatBadge.textContent = fmtText;

  dom.npLoopBadge.hidden = !(np.loopActive || np.isLoopSession);

  dom.npTitle.textContent = np.title;
  dom.npArtist.textContent = np.album
    ? `${np.artist} · ${np.album}`
    : np.artist;

  const pct =
    np.duration > 0 ? Math.min(100, (np.currentTime / np.duration) * 100) : 0;
  dom.npBarFill.style.width = `${pct.toFixed(1)}%`;

  const extras = [];
  if (np.playbackRate && np.playbackRate !== 1)
    extras.push(`${np.playbackRate}x`);
  if (np.muted) extras.push("🔇");
  const clock =
    np.duration > 0
      ? `${formatClock(np.currentTime)} / ${formatClock(np.duration)}`
      : formatClock(np.currentTime);
  dom.npTime.textContent = extras.length
    ? `${clock} · ${extras.join(" ")}`
    : clock;

  const remaining = Math.max(
    0,
    (np.minRequired || 20) - (np.sessionSeconds || 0),
  );
  if (remaining === 0) {
    dom.npCountState.textContent = "✓ Registrado";
    dom.npCountState.classList.add("saved");
  } else {
    dom.npCountState.textContent = `Cuenta en ${remaining}s`;
    dom.npCountState.classList.remove("saved");
  }
}

function renderBestNowPlaying() {
  const now = Date.now();
  const candidates = [...npTabsMap.values()].filter((v) =>
    v.paused ? now - v.updatedAt < 3600000 : now - v.updatedAt < 10000,
  );

  if (candidates.length === 0) {
    renderNowPlaying(null);
    return;
  }

  candidates.sort((a, b) => {
    if (a.paused !== b.paused) return a.paused ? 1 : -1;
    if (a.visible !== b.visible) return a.visible ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });

  renderNowPlaying(candidates[0]);
}

// --- RENDER DE PESTAÑAS ---
function getFilteredPlays(checkDate = true) {
  return store.history.filter((it) =>
    matchesFilter(
      it,
      dom.periodSelect.value,
      dom.sourceSelect.value,
      checkDate,
    ),
  );
}

function getFilteredMeta(items, checkDate = true) {
  return items.filter((it) =>
    matchesPeriodAndSourceOnly(
      it,
      dom.periodSelect.value,
      dom.sourceSelect.value,
      checkDate,
    ),
  );
}

function renderSummaryTab() {
  const filtered = getFilteredPlays(true);

  if (filtered.length === 0) {
    dom.totalTime.textContent = "0 min";
    dom.totalPlays.textContent = "0";
    dom.totalLoops.textContent = "🔁 0";
    dom.uniqueCount.textContent = "0";
    dom.streakDays.textContent = "0 días";
    dom.peakHour.textContent = "—";
    dom.exportImgBtn.hidden = true;
    dom.makePlaylistBtn.hidden = true;
    uiState.summaryCardData = null;
    dom.topList.replaceChildren();
    dom.emptyMsg.hidden = false;
    return;
  }

  dom.emptyMsg.hidden = true;
  let totalSeconds = 0;
  let totalLoops = 0;
  const hoursBuckets = new Array(24).fill(0);
  const artistsMap = new Map();

  for (const item of filtered) {
    totalSeconds += item.seconds || 0;
    if (item.isLoop) totalLoops += 1;
    hoursBuckets[new Date(item.timestamp).getHours()] += item.seconds || 0;
    const ak = item.artist || "Desconocido";
    const cur = artistsMap.get(ak) || { plays: 0, seconds: 0 };
    cur.plays += 1;
    cur.seconds += item.seconds || 0;
    artistsMap.set(ak, cur);
  }

  const topTracksAll = aggregateTracks(filtered);
  uiState.topVideoIds = topTracksAll
    .map((t) => t.videoId)
    .filter(Boolean)
    .slice(0, 20);
  dom.makePlaylistBtn.hidden = uiState.topVideoIds.length === 0;

  const topArtist =
    [...artistsMap.entries()].sort(
      (a, b) => b[1].seconds - a[1].seconds || b[1].plays - a[1].plays,
    )[0]?.[0] || "—";

  const periodLabel =
    dom.periodSelect.options[dom.periodSelect.selectedIndex]?.text ||
    "Mi Recap";
  uiState.summaryCardData = {
    subtitle: periodLabel.toUpperCase(),
    topTracks: topTracksAll.slice(0, 5),
    totalSeconds,
    totalPlays: filtered.length,
    totalLoops,
    topArtist,
  };
  dom.exportImgBtn.hidden = topTracksAll.length === 0;

  const maxHourSec = Math.max(...hoursBuckets);
  const peakIdx = hoursBuckets.indexOf(maxHourSec);
  const streak = computeStreak(filtered);

  dom.totalTime.textContent = formatDuration(totalSeconds);
  dom.totalPlays.textContent = String(filtered.length);
  dom.totalLoops.textContent = `🔁 ${totalLoops}`;
  dom.uniqueCount.textContent = String(topTracksAll.length);
  dom.streakDays.textContent = `${streak} ${streak === 1 ? "día" : "días"}`;
  dom.peakHour.textContent =
    maxHourSec > 0 ? `${String(peakIdx).padStart(2, "0")}:00h` : "—";

  dom.topList.replaceChildren(
    ...topTracksAll.slice(0, 15).map((track, idx) => {
      const mins =
        track.seconds > 0
          ? `${Math.max(1, Math.round(track.seconds / 60))}m`
          : "Imp.";
      const avgPct =
        track.pctCount > 0
          ? ` · ${Math.round(track.pctSum / track.pctCount)}%`
          : "";
      const right =
        track.loops > 0
          ? `${track.plays}x (🔁${track.loops}) · ${mins}`
          : `${track.plays}x · ${mins}${avgPct}`;
      return buildTrackRow(
        String(idx + 1),
        track.artwork,
        track.title,
        track.artist,
        right,
        {
          href: track.videoUrl || undefined,
        },
      );
    }),
  );
}

function renderRecentTab() {
  if (uiState.recentMode === "plays") {
    const filtered = getFilteredPlays(true);
    dom.recentEmpty.hidden = filtered.length > 0;
    if (filtered.length === 0) {
      dom.recentList.replaceChildren();
      return;
    }
    const items = [...filtered]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 30);
    dom.recentList.replaceChildren(
      ...items.map((item) => {
        const timeStr = new Date(item.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        const tags = [];
        if (item.isLoop) tags.push("🔁 Bucle");
        if (item.category) tags.push(translateCategory(item.category));
        if (item.contentType === "short") tags.push("Short");
        if (item.contentType === "live") tags.push("Live");
        if (item.playbackRate && item.playbackRate !== 1)
          tags.push(`${item.playbackRate}x`);
        if (item.mostlyMuted) tags.push("🔇");
        if (item.imported) tags.push("Takeout");
        const sub = `${item.artist} · ${timeStr}${tags.length ? " · " + tags.join(" · ") : ""}`;
        return buildTrackRow(
          item.isLoop ? "🔁" : "•",
          item.artwork,
          item.title,
          sub,
          item.seconds > 0 ? formatClock(item.seconds) : "—",
          { href: resolveVideoUrl(item) || undefined },
        );
      }),
    );
    return;
  }

  if (uiState.recentMode === "likes" || uiState.recentMode === "subs") {
    const type = uiState.recentMode === "likes" ? "like" : "subscribe";
    const items = getFilteredMeta(store.interactions, true)
      .filter((it) => it.type === type)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 30);
    dom.recentEmpty.hidden = items.length > 0;
    dom.recentList.replaceChildren(...items.map(renderInteractionRow));
    return;
  }

  const searches = getFilteredMeta(store.searches, true)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 30);
  dom.recentEmpty.hidden = searches.length > 0;
  dom.recentList.replaceChildren(...searches.map(renderSearchRow));
}

function renderActivityTab() {
  const filtered = getFilteredPlays(true);
  const filteredInter = getFilteredMeta(store.interactions, true);
  const filteredSearches = getFilteredMeta(store.searches, true);
  const filteredSkips = store.skips.filter((it) =>
    matchesFilter(it, dom.periodSelect.value, dom.sourceSelect.value, true),
  );

  const likesCount = filteredInter.filter((it) => it.type === "like").length;
  const subsCount = filteredInter.filter(
    (it) => it.type === "subscribe",
  ).length;

  const hoursBuckets = new Array(24).fill(0);
  const formatCounts = { video: 0, music: 0, short: 0, live: 0 };
  const contextCounts = { direct: 0, mix: 0, playlist: 0 };
  const categoriesMap = new Map();
  const artistsMap = new Map();
  const albumsMap = new Map();
  let rateSum = 0;
  let rateCount = 0;

  for (const item of filtered) {
    hoursBuckets[new Date(item.timestamp).getHours()] += item.seconds || 0;
    const cType =
      item.contentType || (item.source === "yt_music" ? "music" : "video");
    formatCounts[cType] = (formatCounts[cType] || 0) + 1;
    const ctx = item.context || "direct";
    contextCounts[ctx] = (contextCounts[ctx] || 0) + 1;

    const catKey = item.category || (item.source === "yt_music" ? "Music" : "");
    if (catKey) {
      const c = categoriesMap.get(catKey) || { plays: 0, seconds: 0 };
      c.plays += 1;
      c.seconds += item.seconds || 0;
      categoriesMap.set(catKey, c);
    }

    if (item.playbackRate) {
      rateSum += item.playbackRate;
      rateCount += 1;
    }

    const ak = item.artist || "Desconocido";
    const as = artistsMap.get(ak) || {
      plays: 0,
      seconds: 0,
      artwork: item.artwork,
      url: item.channelUrl || "",
    };
    as.plays += 1;
    as.seconds += item.seconds || 0;
    if (!as.artwork && item.artwork) as.artwork = item.artwork;
    if (!as.url && item.channelUrl) as.url = item.channelUrl;
    artistsMap.set(ak, as);

    if (item.album) {
      const albKey = `${item.album.toLowerCase()}::${ak.toLowerCase()}`;
      const alb = albumsMap.get(albKey) || {
        album: item.album,
        artist: item.artist,
        artwork: item.artwork,
        plays: 0,
        seconds: 0,
      };
      alb.plays += 1;
      alb.seconds += item.seconds || 0;
      if (!alb.artwork && item.artwork) alb.artwork = item.artwork;
      albumsMap.set(albKey, alb);
    }
  }

  const catEntries = [...categoriesMap.entries()].sort(
    (a, b) => b[1].seconds - a[1].seconds || b[1].plays - a[1].plays,
  );
  dom.categoriesBox.hidden = catEntries.length === 0;
  if (catEntries.length > 0) {
    const totalWeight = catEntries.reduce(
      (acc, [, st]) => acc + (st.seconds || st.plays),
      0,
    );
    dom.categoriesList.replaceChildren(
      ...catEntries.slice(0, 6).map(([rawCat, st]) => {
        const pct =
          totalWeight > 0
            ? Math.max(
                4,
                Math.round(((st.seconds || st.plays) / totalWeight) * 100),
              )
            : 0;
        const row = document.createElement("div");
        row.className = "cat-row";
        const top = document.createElement("div");
        top.className = "cat-row-top";
        const lbl = document.createElement("span");
        lbl.textContent = translateCategory(rawCat);
        const meta = document.createElement("span");
        meta.textContent = `${pct}% · ${st.plays}x (${formatDuration(st.seconds)})`;
        top.append(lbl, meta);
        const track = document.createElement("div");
        track.className = "cat-track";
        const fill = document.createElement("div");
        fill.className = "cat-fill";
        fill.style.width = `${pct}%`;
        track.append(fill);
        row.append(top, track);
        return row;
      }),
    );
  }

  const maxHourSec = Math.max(...hoursBuckets);
  dom.hoursChart.replaceChildren(
    ...hoursBuckets.map((sec, h) => {
      const bar = document.createElement("div");
      bar.className = sec === 0 ? "hour-bar zero" : "hour-bar";
      const pct =
        maxHourSec > 0 ? Math.max(5, Math.round((sec / maxHourSec) * 100)) : 5;
      bar.style.height = sec === 0 ? "4px" : `${pct}%`;
      bar.title = `${String(h).padStart(2, "0")}:00 — ${formatDuration(sec)}`;
      return bar;
    }),
  );

  const avgRate =
    rateCount > 0
      ? `${(rateSum / rateCount).toFixed(2).replace(/\.00$/, "")}x`
      : "1x";
  const chips = [
    ["Videos", formatCounts.video || 0],
    ["YT Music", formatCounts.music || 0],
    ["Shorts", formatCounts.short || 0],
    ["Directos", formatCounts.live || 0],
    [
      "Mix / Playlist",
      (contextCounts.mix || 0) + (contextCounts.playlist || 0),
    ],
    ["Vel. promedio", avgRate],
    ["❤️ Me gusta", likesCount],
    ["🔍 Búsquedas", filteredSearches.length],
    ["🔔 Suscrip.", subsCount],
  ];
  dom.breakdownStats.replaceChildren(
    ...chips.map(([label, val]) => {
      const div = document.createElement("div");
      div.className = "bd-chip";
      const sp = document.createElement("span");
      sp.textContent = label;
      const st = document.createElement("strong");
      st.textContent = String(val);
      div.append(sp, st);
      return div;
    }),
  );

  dom.searchesBox.hidden = filteredSearches.length === 0;
  if (filteredSearches.length > 0) {
    const sMap = new Map();
    for (const s of filteredSearches) {
      const cur = sMap.get(s.normalized) || {
        query: s.query,
        url: s.url,
        source: s.source,
        count: 0,
      };
      cur.count += 1;
      if (s.url) cur.url = s.url;
      sMap.set(s.normalized, cur);
    }
    const topS = [...sMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    dom.topSearchesList.replaceChildren(
      ...topS.map((s, idx) =>
        buildTrackRow(
          String(idx + 1),
          "",
          s.query,
          s.source === "yt_music" ? "YT Music" : "YouTube",
          `${s.count}x`,
          {
            href: s.url || undefined,
          },
        ),
      ),
    );
  }

  const topAlbums = [...albumsMap.values()]
    .sort((a, b) => b.plays - a.plays || b.seconds - a.seconds)
    .slice(0, 5);
  dom.albumsBox.hidden = topAlbums.length === 0;
  if (topAlbums.length > 0) {
    dom.topAlbumsList.replaceChildren(
      ...topAlbums.map((a, idx) =>
        buildTrackRow(
          String(idx + 1),
          a.artwork,
          a.album,
          a.artist,
          `${a.plays}x · ${formatDuration(a.seconds)}`,
        ),
      ),
    );
  }

  const topArtists = [...artistsMap.entries()]
    .sort((a, b) => b[1].seconds - a[1].seconds || b[1].plays - a[1].plays)
    .slice(0, 5);
  dom.topArtistsList.replaceChildren(
    ...topArtists.map(([name, st], idx) =>
      buildTrackRow(
        String(idx + 1),
        st.artwork,
        name,
        `${st.plays} reproducciones`,
        formatDuration(st.seconds),
        {
          href: st.url || undefined,
        },
      ),
    ),
  );

  dom.skipsBox.hidden = filteredSkips.length === 0;
  if (filteredSkips.length > 0) {
    const skipsMap = new Map();
    for (const sk of filteredSkips) {
      const key = getGroupKey(sk);
      const cur = skipsMap.get(key) || {
        title: sk.title,
        artist: sk.artist,
        artwork: sk.artwork,
        videoUrl: resolveVideoUrl(sk),
        count: 0,
      };
      cur.count += 1;
      skipsMap.set(key, cur);
    }
    const topSkips = [...skipsMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    dom.topSkipsList.replaceChildren(
      ...topSkips.map((s, idx) =>
        buildTrackRow(
          String(idx + 1),
          s.artwork,
          s.title,
          s.artist,
          `${s.count} skips`,
          {
            href: s.videoUrl || undefined,
          },
        ),
      ),
    );
  }
}

function renderCalendarTab() {
  const sourcePlays = getFilteredPlays(false);
  const sourceInteractions = getFilteredMeta(store.interactions, false);
  const sourceSearches = getFilteredMeta(store.searches, false);

  const playsByDate = new Map();
  const interByDate = new Map();
  const searchesByDate = new Map();

  for (const item of sourcePlays) {
    const k = toDateKey(new Date(item.timestamp));
    if (!playsByDate.has(k)) playsByDate.set(k, []);
    playsByDate.get(k).push(item);
  }
  for (const it of sourceInteractions) {
    const k = toDateKey(new Date(it.timestamp));
    if (!interByDate.has(k)) interByDate.set(k, []);
    interByDate.get(k).push(it);
  }
  for (const s of sourceSearches) {
    const k = toDateKey(new Date(s.timestamp));
    if (!searchesByDate.has(k)) searchesByDate.set(k, []);
    searchesByDate.get(k).push(s);
  }

  const monthDate = new Date(uiState.calYear, uiState.calMonth, 1);
  dom.calMonthLabel.textContent = new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(monthDate);

  const rawMonthWord = new Intl.DateTimeFormat("es-AR", {
    month: "long",
  }).format(monthDate);
  const shortMonth = new Intl.DateTimeFormat("es-AR", {
    month: "short",
  }).format(monthDate);
  dom.calWeeksTitle.textContent = `Top por semana de ${rawMonthWord}`;

  const firstWeekday = monthDate.getDay();
  const daysInMonth = new Date(
    uiState.calYear,
    uiState.calMonth + 1,
    0,
  ).getDate();
  const prevMonthDays = new Date(
    uiState.calYear,
    uiState.calMonth,
    0,
  ).getDate();
  const todayKey = toDateKey(new Date());

  const cells = [];
  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({
      date: new Date(uiState.calYear, uiState.calMonth - 1, prevMonthDays - i),
      otherMonth: true,
    });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      date: new Date(uiState.calYear, uiState.calMonth, day),
      otherMonth: false,
    });
  }
  const rem = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= rem; i++) {
    cells.push({
      date: new Date(uiState.calYear, uiState.calMonth + 1, i),
      otherMonth: true,
    });
  }

  dom.calGrid.replaceChildren(
    ...cells.map(({ date, otherMonth }) => {
      const key = toDateKey(date);
      const dp = playsByDate.get(key) || [];
      const di = interByDate.get(key) || [];
      const ds = searchesByDate.get(key) || [];

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cal-day";
      btn.textContent = String(date.getDate());
      if (otherMonth) btn.classList.add("other-month");
      if (key === todayKey) btn.classList.add("today");
      if (dp.length || di.length || ds.length) {
        btn.classList.add("has-activity");
        const lk = di.filter((x) => x.type === "like").length;
        const sb = di.filter((x) => x.type === "subscribe").length;
        const tips = [];
        if (dp.length) tips.push(`${dp.length} rep.`);
        if (lk) tips.push(`❤️ ${lk}`);
        if (sb) tips.push(`🔔 ${sb}`);
        if (ds.length) tips.push(`🔍 ${ds.length}`);
        btn.title = tips.join(" · ");
      }
      if (key === uiState.selectedDateKey) btn.classList.add("selected");

      btn.addEventListener("click", () => {
        uiState.selectedDateKey = key;
        if (otherMonth) {
          uiState.calYear = date.getFullYear();
          uiState.calMonth = date.getMonth();
        }
        renderCalendarTab();
      });
      return btn;
    }),
  );

  const [sy, sm, sd] = uiState.selectedDateKey.split("-").map(Number);
  const formattedDay = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(sy, sm - 1, sd));

  const dayPlays = playsByDate.get(uiState.selectedDateKey) || [];
  const dayInter = interByDate.get(uiState.selectedDateKey) || [];
  const dayLikes = dayInter.filter((x) => x.type === "like");
  const daySubs = dayInter.filter((x) => x.type === "subscribe");
  const daySearches = searchesByDate.get(uiState.selectedDateKey) || [];

  const dayTotalSec = dayPlays.reduce((acc, it) => acc + (it.seconds || 0), 0);
  const dayMeta = [];
  if (dayPlays.length)
    dayMeta.push(`${formatDuration(dayTotalSec)} (${dayPlays.length}x)`);
  if (dayLikes.length) dayMeta.push(`❤️ ${dayLikes.length}`);
  if (daySubs.length) dayMeta.push(`🔔 ${daySubs.length}`);
  if (daySearches.length) dayMeta.push(`🔍 ${daySearches.length}`);
  dom.calDayTitle.textContent = dayMeta.length
    ? `${formattedDay} · ${dayMeta.join(" · ")}`
    : formattedDay;

  const combined = [];
  if (uiState.calDayMode === "all" || uiState.calDayMode === "plays") {
    dayPlays.forEach((d) =>
      combined.push({ kind: "play", ts: d.timestamp, d }),
    );
  }
  if (uiState.calDayMode === "all" || uiState.calDayMode === "likes") {
    dayLikes.forEach((d) =>
      combined.push({ kind: "like", ts: d.timestamp, d }),
    );
  }
  if (uiState.calDayMode === "all" || uiState.calDayMode === "subs") {
    daySubs.forEach((d) => combined.push({ kind: "sub", ts: d.timestamp, d }));
  }
  if (uiState.calDayMode === "all" || uiState.calDayMode === "searches") {
    daySearches.forEach((d) =>
      combined.push({ kind: "search", ts: d.timestamp, d }),
    );
  }
  combined.sort((a, b) => b.ts - a.ts);

  dom.calDayEmpty.hidden = combined.length > 0;
  dom.calDayList.replaceChildren(
    ...combined.map(({ kind, ts, d }) => {
      const timeStr = new Date(ts).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      if (kind === "play") {
        const sub = `${d.artist} · ${timeStr}${d.isLoop ? " · 🔁 Bucle" : ""}`;
        return buildTrackRow(
          d.isLoop ? "🔁" : "•",
          d.artwork,
          d.title,
          sub,
          d.seconds > 0 ? formatClock(d.seconds) : "Takeout",
          { href: resolveVideoUrl(d) || undefined },
        );
      }
      if (kind === "like" || kind === "sub") return renderInteractionRow(d);
      return renderSearchRow(d);
    }),
  );

  const inViewedMonth = (item) => {
    const d = new Date(item.timestamp);
    return (
      d.getFullYear() === uiState.calYear && d.getMonth() === uiState.calMonth
    );
  };
  const monthPlays = sourcePlays.filter(inViewedMonth);
  const monthInter = sourceInteractions
    .filter(inViewedMonth)
    .sort((a, b) => b.timestamp - a.timestamp);

  const monthTotalSec = monthPlays.reduce(
    (acc, it) => acc + (it.seconds || 0),
    0,
  );
  const monthLoops = monthPlays.filter((it) => it.isLoop).length;
  const monthLikes = monthInter.filter((x) => x.type === "like").length;
  const monthSubs = monthInter.filter((x) => x.type === "subscribe").length;

  const mMeta = [];
  if (monthPlays.length)
    mMeta.push(`${formatDuration(monthTotalSec)} (${monthPlays.length}x)`);
  if (monthLoops) mMeta.push(`🔁${monthLoops}`);
  if (monthLikes) mMeta.push(`❤️${monthLikes}`);
  if (monthSubs) mMeta.push(`🔔${monthSubs}`);
  dom.calMonthTopTitle.textContent = mMeta.length
    ? `Top de ${rawMonthWord} · ${mMeta.join(" · ")}`
    : `Top de ${rawMonthWord}`;

  if (monthPlays.length === 0) {
    uiState.monthTopVideoIds = [];
    uiState.monthCardData = null;
    dom.calMonthImgBtn.hidden = true;
    dom.calMonthPlaylistBtn.hidden = true;
    dom.calMonthTopList.replaceChildren();
    dom.calMonthTopEmpty.hidden = false;
  } else {
    dom.calMonthTopEmpty.hidden = true;
    const topMonth = aggregateTracks(monthPlays);
    uiState.monthTopVideoIds = topMonth
      .map((t) => t.videoId)
      .filter(Boolean)
      .slice(0, 20);
    dom.calMonthPlaylistBtn.hidden = uiState.monthTopVideoIds.length === 0;

    const mArtists = new Map();
    for (const it of monthPlays) {
      const k = it.artist || "YouTube";
      mArtists.set(k, (mArtists.get(k) || 0) + (it.seconds || 1));
    }
    const topMonthArtist =
      [...mArtists.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    uiState.monthCardData = {
      subtitle: `${rawMonthWord.toUpperCase()} ${uiState.calYear}`,
      topTracks: topMonth.slice(0, 5),
      totalSeconds: monthTotalSec,
      totalPlays: monthPlays.length,
      totalLoops: monthLoops,
      topArtist: topMonthArtist,
    };
    dom.calMonthImgBtn.hidden = topMonth.length === 0;

    dom.calMonthTopList.replaceChildren(
      ...topMonth.slice(0, 10).map((track, idx) => {
        const mins =
          track.seconds > 0
            ? `${Math.max(1, Math.round(track.seconds / 60))}m`
            : "Imp.";
        const right =
          track.loops > 0
            ? `${track.plays}x (🔁${track.loops}) · ${mins}`
            : `${track.plays}x · ${mins}`;
        return buildTrackRow(
          String(idx + 1),
          track.artwork,
          track.title,
          track.artist,
          right,
          {
            href: track.videoUrl || undefined,
          },
        );
      }),
    );
  }

  dom.calMonthSocialBox.hidden = monthInter.length === 0;
  if (monthInter.length > 0) {
    dom.calMonthSocialTitle.textContent = `Me gusta y suscripciones de ${rawMonthWord}`;
    dom.calMonthSocialList.replaceChildren(
      ...monthInter.slice(0, 20).map(renderInteractionRow),
    );
  }

  const weekRanges = [
    { num: 1, start: 1, end: 7 },
    { num: 2, start: 8, end: 14 },
    { num: 3, start: 15, end: 21 },
    { num: 4, start: 22, end: 28 },
  ];
  if (daysInMonth > 28)
    weekRanges.push({ num: 5, start: 29, end: daysInMonth });

  dom.calWeeksList.replaceChildren(
    ...weekRanges.map((w) => {
      const wItems = monthPlays.filter((it) => {
        const day = new Date(it.timestamp).getDate();
        return day >= w.start && day <= w.end;
      });
      const card = document.createElement("div");
      card.className = wItems.length === 0 ? "week-card empty" : "week-card";

      const header = document.createElement("div");
      header.className = "week-header";
      const title = document.createElement("span");
      title.className = "week-title";
      title.textContent = `Semana ${w.num} (${w.start}–${w.end} ${shortMonth})`;

      const rightBox = document.createElement("div");
      rightBox.className = "week-right";
      const meta = document.createElement("span");
      meta.className = "week-meta";

      if (wItems.length === 0) {
        meta.textContent = "Sin actividad";
        rightBox.append(meta);
        header.append(title, rightBox);
        card.append(header);
        return card;
      }

      const wSec = wItems.reduce((acc, it) => acc + (it.seconds || 0), 0);
      meta.textContent = `${formatDuration(wSec)} · ${wItems.length} rep.`;
      rightBox.append(meta);

      const topWeek = aggregateTracks(wItems);
      const weekIds = topWeek
        .map((t) => t.videoId)
        .filter(Boolean)
        .slice(0, 20);
      if (weekIds.length > 0) {
        const plBtn = document.createElement("button");
        plBtn.className = "mini-btn";
        plBtn.textContent = "▶";
        plBtn.title = "Crear playlist de esta semana";
        plBtn.addEventListener("click", () => openInstantPlaylist(weekIds));
        rightBox.append(plBtn);
      }

      header.append(title, rightBox);

      const ul = document.createElement("ul");
      ul.className = "week-tracks";
      ul.append(
        ...topWeek.slice(0, 3).map((track, idx) => {
          const mins =
            track.seconds > 0
              ? `${Math.max(1, Math.round(track.seconds / 60))}m`
              : "Imp.";
          const right =
            track.loops > 0
              ? `${track.plays}x (🔁${track.loops}) · ${mins}`
              : `${track.plays}x · ${mins}`;
          return buildTrackRow(
            String(idx + 1),
            track.artwork,
            track.title,
            track.artist,
            right,
            {
              href: track.videoUrl || undefined,
            },
          );
        }),
      );
      card.append(header, ul);
      return card;
    }),
  );
}

function renderChannelsTab() {
  const filteredVisits = getFilteredMeta(store.channelVisits, true);
  const filteredPlays = getFilteredPlays(true);
  const newSubsCount = getFilteredMeta(store.interactions, true).filter(
    (it) => it.type === "subscribe",
  ).length;

  const channelsMap = new Map();
  const getCh = (key, name) => {
    if (!channelsMap.has(key)) {
      channelsMap.set(key, {
        name: name || "Canal",
        avatar: "",
        url: "",
        visits: 0,
        plays: 0,
        seconds: 0,
      });
    }
    return channelsMap.get(key);
  };

  for (const v of filteredVisits) {
    const ch = getCh(
      (v.name || v.channelKey || "canal").trim().toLowerCase(),
      v.name,
    );
    ch.visits += 1;
    if (v.avatar) ch.avatar = v.avatar;
    if (v.url) ch.url = v.url;
  }
  for (const p of filteredPlays) {
    const ch = getCh((p.artist || "youtube").trim().toLowerCase(), p.artist);
    ch.plays += 1;
    ch.seconds += p.seconds || 0;
    if (!ch.url && p.channelUrl) ch.url = p.channelUrl;
    if (!ch.avatar && p.artwork) ch.avatar = p.artwork;
  }

  const ranked = [...channelsMap.values()].sort(
    (a, b) => b.visits - a.visits || b.plays - a.plays || b.seconds - a.seconds,
  );

  dom.chUniqueCount.textContent = String(ranked.length);
  dom.chTotalVisits.textContent = String(filteredVisits.length);
  dom.chNewSubs.textContent = `🔔 ${newSubsCount}`;

  dom.channelsEmpty.hidden = ranked.length > 0;
  dom.channelsTopList.replaceChildren(
    ...ranked.slice(0, 20).map((ch, idx) => {
      const subParts = [];
      if (ch.visits > 0)
        subParts.push(
          `👁️ ${ch.visits} ${ch.visits === 1 ? "visita" : "visitas"}`,
        );
      if (ch.plays > 0) subParts.push(`▶ ${ch.plays} rep.`);
      return buildTrackRow(
        String(idx + 1),
        ch.avatar,
        ch.name,
        subParts.join(" · "),
        ch.seconds > 0 ? formatDuration(ch.seconds) : `${ch.visits}x`,
        { href: ch.url || undefined, avatar: true },
      );
    }),
  );

  dom.channelsRecentEmpty.hidden = filteredVisits.length > 0;
  const recentVisits = [...filteredVisits]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 20);
  dom.channelsRecentList.replaceChildren(
    ...recentVisits.map((v) =>
      buildTrackRow(
        "👁",
        v.avatar,
        v.name,
        `${v.source === "yt_music" ? "YT Music" : "YouTube"} · ${formatShortDateTime(v.timestamp)}`,
        "Abrir ↗",
        { href: v.url || undefined, avatar: true },
      ),
    ),
  );
}

function renderLikesTab() {
  const likes = getFilteredMeta(store.interactions, true)
    .filter((it) => it.type === "like")
    .sort((a, b) => b.timestamp - a.timestamp);
  const subs = getFilteredMeta(store.interactions, true)
    .filter((it) => it.type === "subscribe")
    .sort((a, b) => b.timestamp - a.timestamp);
  const searches = getFilteredMeta(store.searches, true).sort(
    (a, b) => b.timestamp - a.timestamp,
  );

  dom.lkTotalLikes.textContent = `❤️ ${likes.length}`;
  dom.lkTotalSubs.textContent = `🔔 ${subs.length}`;
  dom.lkTotalSearches.textContent = `🔍 ${searches.length}`;

  dom.likesEmpty.hidden = likes.length > 0;
  dom.likesList.replaceChildren(
    ...likes.slice(0, 30).map(renderInteractionRow),
  );

  dom.subsEmpty.hidden = subs.length > 0;
  dom.subsList.replaceChildren(...subs.slice(0, 30).map(renderInteractionRow));

  dom.socialSearchesEmpty.hidden = searches.length > 0;
  dom.socialSearchesList.replaceChildren(
    ...searches.slice(0, 25).map(renderSearchRow),
  );
}

const TAB_RENDERERS = {
  summary: renderSummaryTab,
  recent: renderRecentTab,
  activity: renderActivityTab,
  calendar: renderCalendarTab,
  channels: renderChannelsTab,
  likes: renderLikesTab,
};

function renderActiveTab() {
  TAB_RENDERERS[uiState.activeTab]?.();
  uiState.dirtyTabs.delete(uiState.activeTab);
}

function invalidateAllTabs() {
  Object.keys(TAB_RENDERERS).forEach((t) => uiState.dirtyTabs.add(t));
  renderActiveTab();
}

// --- EXPORTAR PNG Y ZIP ---
async function handleExportPng(cardData, btn) {
  if (!cardData || cardData.topTracks.length === 0) return;
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = "⏳...";
  try {
    const blob = await renderRecapPngBlob(cardData);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recap-${sanitizeFileSlug(cardData.subtitle)}-${toDateKey(new Date())}.png`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

dom.exportBtn.addEventListener("click", async () => {
  const orig = dom.exportBtn.textContent;
  dom.exportBtn.disabled = true;
  dom.exportBtn.textContent = "⏳...";

  try {
    if (uiState.dirtyTabs.has("summary")) renderSummaryTab();

    const imageTasks = [];
    const seenUrls = new Set();
    const usedNames = new Set();

    const queueImage = (url, folder, label) => {
      if (!url?.startsWith("http") || seenUrls.has(url)) return;
      seenUrls.add(url);
      const slug = sanitizeFileSlug(label);
      let unique = slug;
      let n = 2;
      while (usedNames.has(`${folder}/${unique}`)) unique = `${slug}-${n++}`;
      usedNames.add(`${folder}/${unique}`);
      imageTasks.push({ url, folder, slug: unique });
    };

    store.history.forEach((it) =>
      queueImage(it.artwork, "imagenes/portadas", it.videoId || it.title),
    );
    store.channelVisits.forEach((ch) =>
      queueImage(ch.avatar, "imagenes/canales", ch.name || ch.channelKey),
    );
    store.interactions.forEach((it) =>
      queueImage(
        it.artwork,
        it.type === "subscribe" ? "imagenes/canales" : "imagenes/portadas",
        it.title,
      ),
    );
    store.skips.forEach((sk) =>
      queueImage(sk.artwork, "imagenes/portadas", sk.videoId || sk.title),
    );

    const zipFiles = [];
    const imageMap = {};
    let done = 0;

    for (let i = 0; i < imageTasks.length; i += 6) {
      await Promise.all(
        imageTasks.slice(i, i + 6).map(async (task) => {
          try {
            const res = await fetch(task.url);
            if (!res.ok) return;
            const blob = await res.blob();
            const buf = new Uint8Array(await blob.arrayBuffer());
            const filePath = `${task.folder}/${task.slug}.${getExtFromMime(blob.type)}`;
            zipFiles.push({ name: filePath, data: buf });
            imageMap[task.url] = filePath;
          } catch {
            // Ignorar imagen inaccesible
          } finally {
            done += 1;
            dom.exportBtn.textContent = `⏳ ${done}/${imageTasks.length}`;
          }
        }),
      );
    }

    if (uiState.summaryCardData) {
      const cardBlob = await renderRecapPngBlob(uiState.summaryCardData);
      if (cardBlob) {
        zipFiles.push({
          name: "recap-tarjeta.png",
          data: new Uint8Array(await cardBlob.arrayBuffer()),
        });
      }
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      ...store,
      imageMap,
    };
    zipFiles.unshift({
      name: "recap-backup.json",
      data: new TextEncoder().encode(JSON.stringify(payload, null, 2)),
    });

    const zipBlob = buildZipBlob(zipFiles);
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `youtube-recap-${toDateKey(new Date())}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus("✓ ZIP exportado con datos, tarjeta PNG e imágenes.");
  } catch (err) {
    showStatus(`Error al exportar: ${err.message}`, true);
  } finally {
    dom.exportBtn.disabled = false;
    dom.exportBtn.textContent = orig;
  }
});

// --- IMPORTAR (.ZIP o .JSON) ---
dom.importBtn.addEventListener("click", () => {
  if (!isFullMode) {
    window.open(chrome.runtime.getURL("popup.html?full=1&import=1"), "_blank");
    return;
  }
  dom.importInput.click();
});

dom.importInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const isZip =
      file.name.toLowerCase().endsWith(".zip") || file.type.includes("zip");
    const parsed = isZip
      ? await extractJsonFromZipBuffer(await file.arrayBuffer())
      : JSON.parse(await file.text());

    const { updatedData, message } = importBackupPayload(parsed, store);
    await chrome.storage.local.set(updatedData);
    Object.assign(store, updatedData);
    invalidateAllTabs();
    showStatus(message);
  } catch (err) {
    showStatus(`Error al importar: ${err.message}`, true);
  } finally {
    dom.importInput.value = "";
  }
});

// --- EVENTOS UI Y REACTIVIDAD ---
dom.expandBtn.addEventListener("click", () => {
  window.open(chrome.runtime.getURL("popup.html?full=1"), "_blank");
});

dom.exportImgBtn.addEventListener("click", () =>
  handleExportPng(uiState.summaryCardData, dom.exportImgBtn),
);
dom.calMonthImgBtn.addEventListener("click", () =>
  handleExportPng(uiState.monthCardData, dom.calMonthImgBtn),
);
dom.makePlaylistBtn.addEventListener("click", () =>
  openInstantPlaylist(uiState.topVideoIds),
);
dom.calMonthPlaylistBtn.addEventListener("click", () =>
  openInstantPlaylist(uiState.monthTopVideoIds),
);

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => (p.hidden = true));

    btn.classList.add("active");
    uiState.activeTab = btn.dataset.tab;
    $(`tab-${uiState.activeTab}`).hidden = false;
    if (uiState.dirtyTabs.has(uiState.activeTab)) renderActiveTab();
  });
});

document.querySelectorAll(".sub-pill[data-recent]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".sub-pill[data-recent]")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    uiState.recentMode = btn.dataset.recent;
    renderRecentTab();
  });
});

document.querySelectorAll(".cal-pill[data-calday]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".cal-pill[data-calday]")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    uiState.calDayMode = btn.dataset.calday;
    renderCalendarTab();
  });
});

dom.calPrevBtn.addEventListener("click", () => {
  uiState.calMonth -= 1;
  if (uiState.calMonth < 0) {
    uiState.calMonth = 11;
    uiState.calYear -= 1;
  }
  uiState.selectedDateKey = toDateKey(
    new Date(uiState.calYear, uiState.calMonth, 1),
  );
  renderCalendarTab();
});

dom.calNextBtn.addEventListener("click", () => {
  uiState.calMonth += 1;
  if (uiState.calMonth > 11) {
    uiState.calMonth = 0;
    uiState.calYear += 1;
  }
  uiState.selectedDateKey = toDateKey(
    new Date(uiState.calYear, uiState.calMonth, 1),
  );
  renderCalendarTab();
});

dom.calTodayBtn.addEventListener("click", () => {
  const today = new Date();
  uiState.calYear = today.getFullYear();
  uiState.calMonth = today.getMonth();
  uiState.selectedDateKey = toDateKey(today);
  renderCalendarTab();
});

dom.periodSelect.addEventListener("change", invalidateAllTabs);
dom.sourceSelect.addEventListener("change", invalidateAllTabs);

dom.clearBtn.addEventListener("click", async () => {
  if (
    !confirm(
      "¿Seguro que querés borrar todo el historial, búsquedas, likes, skips y canales?",
    )
  )
    return;
  const empty = {
    history: [],
    channelVisits: [],
    skips: [],
    interactions: [],
    searches: [],
  };
  await chrome.storage.local.set(empty);
  Object.assign(store, empty);
  invalidateAllTabs();
  showStatus("✓ Historial local borrado.");
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  let npChanged = false;
  let dataChanged = false;

  for (const [key, change] of Object.entries(changes)) {
    if (key.startsWith("np_")) {
      if (change.newValue) npTabsMap.set(key, change.newValue);
      else npTabsMap.delete(key);
      npChanged = true;
    } else if (
      [
        "history",
        "channelVisits",
        "skips",
        "interactions",
        "searches",
      ].includes(key)
    ) {
      store[key] = change.newValue || [];
      dataChanged = true;
    }
  }

  if (npChanged) renderBestNowPlaying();
  if (dataChanged) invalidateAllTabs();
});

async function init() {
  const all = await chrome.storage.local.get(null);

  store.history = Array.isArray(all.history) ? all.history : [];
  store.channelVisits = Array.isArray(all.channelVisits)
    ? all.channelVisits
    : [];
  store.skips = Array.isArray(all.skips) ? all.skips : [];
  store.interactions = Array.isArray(all.interactions) ? all.interactions : [];
  store.searches = Array.isArray(all.searches) ? all.searches : [];

  npTabsMap.clear();
  const staleKeys = [];
  const now = Date.now();
  for (const [key, val] of Object.entries(all)) {
    if (!key.startsWith("np_") || !val) continue;
    if (now - (val.updatedAt || 0) > 3600000) staleKeys.push(key);
    else npTabsMap.set(key, val);
  }
  if (staleKeys.length > 0) chrome.storage.local.remove(staleKeys);

  renderBestNowPlaying();
  invalidateAllTabs();

  // Revisar cada 3s en memoria por si alguna pestaña se cerró sin disparar pagehide
  setInterval(renderBestNowPlaying, 3000);

  if (isFullMode && urlParams.get("import") === "1") {
    showStatus(
      "Modo completo abierto: tocá «Importar» para elegir tu archivo .zip o .json.",
    );
  }
}

init();
