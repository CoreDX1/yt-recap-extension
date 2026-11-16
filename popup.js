const urlParams = new URLSearchParams(location.search);
const isFullMode = urlParams.get("full") === "1";
if (isFullMode) {
  document.body.classList.add("full-mode");
}

const periodSelect = document.getElementById("periodSelect");
const sourceSelect = document.getElementById("sourceSelect");
const expandBtn = document.getElementById("expandBtn");
const importBtn = document.getElementById("importBtn");
const importInput = document.getElementById("importInput");
const exportBtn = document.getElementById("exportBtn");
const importStatus = document.getElementById("importStatus");

// En vivo
const npEmpty = document.getElementById("npEmpty");
const npContent = document.getElementById("npContent");
const npThumb = document.getElementById("npThumb");
const npStatusBadge = document.getElementById("npStatusBadge");
const npSourceBadge = document.getElementById("npSourceBadge");
const npFormatBadge = document.getElementById("npFormatBadge");
const npLoopBadge = document.getElementById("npLoopBadge");
const npTitle = document.getElementById("npTitle");
const npArtist = document.getElementById("npArtist");
const npBarFill = document.getElementById("npBarFill");
const npTime = document.getElementById("npTime");
const npCountState = document.getElementById("npCountState");

// Resumen
const totalTimeEl = document.getElementById("totalTime");
const totalPlaysEl = document.getElementById("totalPlays");
const totalLoopsEl = document.getElementById("totalLoops");
const uniqueCountEl = document.getElementById("uniqueCount");
const streakDaysEl = document.getElementById("streakDays");
const peakHourEl = document.getElementById("peakHour");
const makePlaylistBtn = document.getElementById("makePlaylistBtn");
const topListEl = document.getElementById("topList");
const emptyMsgEl = document.getElementById("emptyMsg");

// Reciente & Horarios
const recentListEl = document.getElementById("recentList");
const recentEmptyEl = document.getElementById("recentEmpty");
const hoursChartEl = document.getElementById("hoursChart");
const breakdownStatsEl = document.getElementById("breakdownStats");
const albumsBoxEl = document.getElementById("albumsBox");
const topAlbumsListEl = document.getElementById("topAlbumsList");
const topArtistsListEl = document.getElementById("topArtistsList");
const skipsBoxEl = document.getElementById("skipsBox");
const topSkipsListEl = document.getElementById("topSkipsList");

// Calendario
const calMonthLabel = document.getElementById("calMonthLabel");
const calPrevBtn = document.getElementById("calPrevBtn");
const calNextBtn = document.getElementById("calNextBtn");
const calTodayBtn = document.getElementById("calTodayBtn");
const calGrid = document.getElementById("calGrid");
const calDayTitle = document.getElementById("calDayTitle");
const calDayList = document.getElementById("calDayList");
const calDayEmpty = document.getElementById("calDayEmpty");
const calWeeksTitle = document.getElementById("calWeeksTitle");
const calWeeksList = document.getElementById("calWeeksList");

// Canales
const chUniqueCountEl = document.getElementById("chUniqueCount");
const chTotalVisitsEl = document.getElementById("chTotalVisits");
const chTopNameEl = document.getElementById("chTopName");
const channelsTopListEl = document.getElementById("channelsTopList");
const channelsEmptyEl = document.getElementById("channelsEmpty");
const channelsRecentListEl = document.getElementById("channelsRecentList");
const channelsRecentEmptyEl = document.getElementById("channelsRecentEmpty");

const clearBtn = document.getElementById("clearBtn");

const nowInit = new Date();
let calYear = nowInit.getFullYear();
let calMonth = nowInit.getMonth();
let selectedDateKey = toDateKey(nowInit);
let cachedHistory = [];
let cachedChannelVisits = [];
let cachedSkips = [];
let currentTopVideoIds = [];

if (isFullMode) expandBtn.hidden = true;

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getGroupKey(item) {
  return `${item.trackKey || item.source}::${(item.title || "").trim().toLowerCase()}`;
}

function extractIdFromItem(item) {
  if (item.videoId) return item.videoId;
  if (item.videoUrl) {
    try {
      const u = new URL(item.videoUrl);
      const v = u.searchParams.get("v");
      if (v) return v;
      const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([^/?#]+)/);
      if (m) return m[1];
    } catch {
      return "";
    }
  }
  if (item.trackKey && item.trackKey.startsWith("yt::")) {
    const parts = item.trackKey.split("::");
    if (parts[1] && parts[1].length >= 8) return parts[1];
  }
  return "";
}

function resolveVideoUrl(item) {
  if (item.videoUrl) return item.videoUrl;
  const vid = extractIdFromItem(item);
  if (!vid) return "";
  return item.source === "yt_music"
    ? `https://music.youtube.com/watch?v=${vid}`
    : `https://www.youtube.com/watch?v=${vid}`;
}

function openInstantPlaylist(videoIds) {
  const uniqueIds = [...new Set(videoIds.filter(Boolean))].slice(0, 50);
  if (uniqueIds.length === 0) return;
  window.open(
    `https://www.youtube.com/watch_videos?video_ids=${uniqueIds.join(",")}`,
    "_blank",
  );
}

function formatClock(secs) {
  const s = Math.max(0, Math.floor(secs));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${String(rem).padStart(2, "0")}`;
}

function formatDuration(totalSeconds) {
  const mins = Math.round(totalSeconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${rem}m`;
}

function computeStreak(items) {
  if (items.length === 0) return 0;
  const daysSet = new Set(
    items.map((item) => toDateKey(new Date(item.timestamp))),
  );

  let streak = 0;
  const cursor = new Date();
  while (true) {
    const key = toDateKey(cursor);
    if (daysSet.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else if (streak === 0) {
      cursor.setDate(cursor.getDate() - 1);
      if (!daysSet.has(toDateKey(cursor))) break;
    } else {
      break;
    }
  }
  return streak;
}

function matchesFilter(item, checkDate = true) {
  const days = periodSelect.value;
  const filter = sourceSelect.value;

  if (checkDate && days !== "all") {
    const cutoff = Date.now() - Number(days) * 24 * 60 * 60 * 1000;
    if (item.timestamp < cutoff) return false;
  }

  const cType =
    item.contentType || (item.source === "yt_music" ? "music" : "video");
  if (filter === "yt_music") return item.source === "yt_music";
  if (filter === "youtube") return item.source === "youtube";
  if (filter === "no_shorts") return cType !== "short";
  if (filter === "short") return cType === "short";
  if (filter === "live") return cType === "live";
  return true;
}

function renderNowPlaying(np) {
  const isStale = !np || (!np.paused && Date.now() - np.updatedAt > 6000);
  if (isStale) {
    npEmpty.hidden = false;
    npContent.hidden = true;
    return;
  }

  npEmpty.hidden = true;
  npContent.hidden = false;

  if (np.artwork) npThumb.src = np.artwork;
  else npThumb.removeAttribute("src");

  npStatusBadge.textContent = np.paused ? "⏸ En pausa" : "● En vivo";
  npStatusBadge.classList.toggle("paused", np.paused);

  npSourceBadge.textContent = np.source === "yt_music" ? "YT Music" : "YouTube";

  const formatLabels = { short: "Short", live: "En vivo", mix: "Mix" };
  const fmtText =
    formatLabels[np.contentType] || (np.context === "mix" ? "Mix" : "");
  if (fmtText) {
    npFormatBadge.textContent = fmtText;
    npFormatBadge.hidden = false;
  } else {
    npFormatBadge.hidden = true;
  }

  npLoopBadge.hidden = !(np.loopActive || np.isLoopSession);

  npTitle.textContent = np.title;
  npArtist.textContent = np.album ? `${np.artist} · ${np.album}` : np.artist;

  const pct =
    np.duration > 0 ? Math.min(100, (np.currentTime / np.duration) * 100) : 0;
  npBarFill.style.width = `${pct.toFixed(1)}%`;

  const extras = [];
  if (np.playbackRate && np.playbackRate !== 1)
    extras.push(`${np.playbackRate}x`);
  if (np.muted) extras.push("🔇");
  const clockText =
    np.duration > 0
      ? `${formatClock(np.currentTime)} / ${formatClock(np.duration)}`
      : formatClock(np.currentTime);
  npTime.textContent =
    extras.length > 0 ? `${clockText} · ${extras.join(" ")}` : clockText;

  const remaining = Math.max(
    0,
    (np.minRequired || 20) - (np.sessionSeconds || 0),
  );
  if (remaining === 0) {
    npCountState.textContent = "✓ Registrado";
    npCountState.classList.add("saved");
  } else {
    npCountState.textContent = `Cuenta en ${remaining}s`;
    npCountState.classList.remove("saved");
  }
}

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

function aggregateTracks(items) {
  const map = new Map();
  for (const item of items) {
    const key = getGroupKey(item);
    const current = map.get(key) || {
      title: item.title,
      artist: item.artist,
      artwork: item.artwork,
      videoId: extractIdFromItem(item),
      videoUrl: resolveVideoUrl(item),
      plays: 0,
      loops: 0,
      seconds: 0,
      pctSum: 0,
      pctCount: 0,
    };
    current.plays += 1;
    if (item.isLoop) current.loops += 1;
    current.seconds += item.seconds || 0;
    if (typeof item.completionPct === "number") {
      current.pctSum += item.completionPct;
      current.pctCount += 1;
    }
    if (!current.artwork && item.artwork) current.artwork = item.artwork;
    if (!current.videoId) current.videoId = extractIdFromItem(item);
    if (!current.videoUrl) current.videoUrl = resolveVideoUrl(item);
    map.set(key, current);
  }
  return [...map.values()].sort(
    (a, b) => b.plays - a.plays || b.seconds - a.seconds,
  );
}

function renderHistory(history) {
  cachedHistory = history;
  const filtered = history.filter((it) => matchesFilter(it, true));

  if (filtered.length === 0) {
    totalTimeEl.textContent = "0 min";
    totalPlaysEl.textContent = "0";
    totalLoopsEl.textContent = "🔁 0";
    uniqueCountEl.textContent = "0";
    streakDaysEl.textContent = "0 días";
    peakHourEl.textContent = "—";
    makePlaylistBtn.hidden = true;
    topListEl.replaceChildren();
    recentListEl.replaceChildren();
    topArtistsListEl.replaceChildren();
    hoursChartEl.replaceChildren();
    breakdownStatsEl.replaceChildren();
    albumsBoxEl.hidden = true;
    emptyMsgEl.hidden = false;
    recentEmptyEl.hidden = false;
  } else {
    emptyMsgEl.hidden = true;
    recentEmptyEl.hidden = true;

    let totalSeconds = 0;
    let totalLoops = 0;
    let rateSum = 0;
    let rateCount = 0;
    const formatCounts = { video: 0, music: 0, short: 0, live: 0 };
    const contextCounts = { direct: 0, mix: 0, playlist: 0 };
    const artistsMap = new Map();
    const albumsMap = new Map();
    const hoursBuckets = new Array(24).fill(0);

    for (const item of filtered) {
      totalSeconds += item.seconds || 0;
      if (item.isLoop) totalLoops += 1;

      const cType =
        item.contentType || (item.source === "yt_music" ? "music" : "video");
      formatCounts[cType] = (formatCounts[cType] || 0) + 1;

      const ctx = item.context || "direct";
      contextCounts[ctx] = (contextCounts[ctx] || 0) + 1;

      if (item.playbackRate) {
        rateSum += item.playbackRate;
        rateCount += 1;
      }

      const hour = new Date(item.timestamp).getHours();
      hoursBuckets[hour] += item.seconds || 0;

      const artistKey = item.artist || "Desconocido";
      const artistStats = artistsMap.get(artistKey) || {
        plays: 0,
        seconds: 0,
        artwork: item.artwork,
        url: item.channelUrl || "",
      };
      artistStats.plays += 1;
      artistStats.seconds += item.seconds || 0;
      if (!artistStats.artwork && item.artwork)
        artistStats.artwork = item.artwork;
      if (!artistStats.url && item.channelUrl)
        artistStats.url = item.channelUrl;
      artistsMap.set(artistKey, artistStats);

      if (item.album) {
        const albKey = `${item.album.toLowerCase()}::${artistKey.toLowerCase()}`;
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

    const topTracksAll = aggregateTracks(filtered);
    currentTopVideoIds = topTracksAll
      .map((t) => t.videoId)
      .filter(Boolean)
      .slice(0, 20);
    makePlaylistBtn.hidden = currentTopVideoIds.length === 0;

    const maxHourSec = Math.max(...hoursBuckets);
    const peakIdx = hoursBuckets.indexOf(maxHourSec);
    const streak = computeStreak(filtered);

    totalTimeEl.textContent = formatDuration(totalSeconds);
    totalPlaysEl.textContent = String(filtered.length);
    totalLoopsEl.textContent = `🔁 ${totalLoops}`;
    uniqueCountEl.textContent = String(topTracksAll.length);
    streakDaysEl.textContent = `${streak} ${streak === 1 ? "día" : "días"}`;
    peakHourEl.textContent =
      maxHourSec > 0 ? `${String(peakIdx).padStart(2, "0")}:00h` : "—";

    topListEl.replaceChildren(
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
          { href: track.videoUrl || undefined },
        );
      }),
    );

    const recentItems = [...filtered]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 25);
    recentListEl.replaceChildren(
      ...recentItems.map((item) => {
        const timeStr = new Date(item.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        const tags = [];
        if (item.isLoop) tags.push("🔁 Bucle");
        if (item.contentType === "short") tags.push("Short");
        if (item.contentType === "live") tags.push("Live");
        if (item.playbackRate && item.playbackRate !== 1)
          tags.push(`${item.playbackRate}x`);
        if (item.mostlyMuted) tags.push("🔇");
        if (item.imported) tags.push("Takeout");
        const sub = `${item.artist} · ${timeStr}${tags.length ? " · " + tags.join(" · ") : ""}`;
        const right = item.seconds > 0 ? formatClock(item.seconds) : "—";
        return buildTrackRow(
          item.isLoop ? "🔁" : "•",
          item.artwork,
          item.title,
          sub,
          right,
          {
            href: resolveVideoUrl(item) || undefined,
          },
        );
      }),
    );

    const bars = hoursBuckets.map((sec, h) => {
      const bar = document.createElement("div");
      bar.className = sec === 0 ? "hour-bar zero" : "hour-bar";
      const pct =
        maxHourSec > 0 ? Math.max(5, Math.round((sec / maxHourSec) * 100)) : 5;
      bar.style.height = sec === 0 ? "4px" : `${pct}%`;
      bar.title = `${String(h).padStart(2, "0")}:00 — ${formatDuration(sec)}`;
      return bar;
    });
    hoursChartEl.replaceChildren(...bars);

    // Desglose formatos, origen y velocidad
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
    ];
    breakdownStatsEl.replaceChildren(
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

    // Top Álbumes
    const topAlbums = [...albumsMap.values()]
      .sort((a, b) => b.plays - a.plays || b.seconds - a.seconds)
      .slice(0, 5);
    if (topAlbums.length > 0) {
      albumsBoxEl.hidden = false;
      topAlbumsListEl.replaceChildren(
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
    } else {
      albumsBoxEl.hidden = true;
    }

    // Top Artistas
    const topArtists = [...artistsMap.entries()]
      .sort((a, b) => b[1].seconds - a[1].seconds || b[1].plays - a[1].plays)
      .slice(0, 5);
    topArtistsListEl.replaceChildren(
      ...topArtists.map(([name, st], idx) =>
        buildTrackRow(
          String(idx + 1),
          st.artwork,
          name,
          `${st.plays} reproducciones`,
          formatDuration(st.seconds),
          { href: st.url || undefined },
        ),
      ),
    );
  }

  renderSkips();
  renderCalendar();
  renderChannels();
}

function renderSkips() {
  const filteredSkips = cachedSkips.filter((it) => matchesFilter(it, true));
  if (filteredSkips.length === 0) {
    skipsBoxEl.hidden = true;
    return;
  }

  skipsBoxEl.hidden = false;
  const skipsMap = new Map();
  for (const s of filteredSkips) {
    const key = getGroupKey(s);
    const cur = skipsMap.get(key) || {
      title: s.title,
      artist: s.artist,
      artwork: s.artwork,
      videoUrl: resolveVideoUrl(s),
      count: 0,
    };
    cur.count += 1;
    skipsMap.set(key, cur);
  }

  const topSkips = [...skipsMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  topSkipsListEl.replaceChildren(
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

function renderChannels() {
  const filteredVisits = cachedChannelVisits.filter((it) =>
    matchesFilter(it, true),
  );
  const filteredPlays = cachedHistory.filter((it) => matchesFilter(it, true));

  const channelsMap = new Map();

  function getOrCreateChannel(key, name) {
    if (!channelsMap.has(key)) {
      channelsMap.set(key, {
        name: name || "Canal",
        avatar: "",
        url: "",
        visits: 0,
        plays: 0,
        seconds: 0,
        lastVisited: 0,
      });
    }
    return channelsMap.get(key);
  }

  for (const v of filteredVisits) {
    const key = (v.name || v.channelKey || "canal").trim().toLowerCase();
    const ch = getOrCreateChannel(key, v.name);
    ch.visits += 1;
    if (v.avatar) ch.avatar = v.avatar;
    if (v.url) ch.url = v.url;
    if (v.timestamp > ch.lastVisited) ch.lastVisited = v.timestamp;
  }

  for (const p of filteredPlays) {
    const key = (p.artist || "youtube").trim().toLowerCase();
    const ch = getOrCreateChannel(key, p.artist);
    ch.plays += 1;
    ch.seconds += p.seconds || 0;
    if (!ch.url && p.channelUrl) ch.url = p.channelUrl;
    if (!ch.avatar && p.artwork) ch.avatar = p.artwork;
  }

  const ranked = [...channelsMap.values()].sort(
    (a, b) => b.visits - a.visits || b.plays - a.plays || b.seconds - a.seconds,
  );

  chUniqueCountEl.textContent = String(ranked.length);
  chTotalVisitsEl.textContent = String(filteredVisits.length);

  const topVisited = [...channelsMap.values()]
    .filter((c) => c.visits > 0)
    .sort((a, b) => b.visits - a.visits || b.lastVisited - a.lastVisited)[0];
  chTopNameEl.textContent = topVisited
    ? `${topVisited.name} (${topVisited.visits})`
    : "—";

  if (ranked.length === 0) {
    channelsTopListEl.replaceChildren();
    channelsEmptyEl.hidden = false;
  } else {
    channelsEmptyEl.hidden = true;
    channelsTopListEl.replaceChildren(
      ...ranked.slice(0, 20).map((ch, idx) => {
        const subParts = [];
        if (ch.visits > 0)
          subParts.push(
            `👁️ ${ch.visits} ${ch.visits === 1 ? "visita" : "visitas"}`,
          );
        if (ch.plays > 0) subParts.push(`▶ ${ch.plays} rep.`);
        const right =
          ch.seconds > 0 ? formatDuration(ch.seconds) : `${ch.visits}x`;
        return buildTrackRow(
          String(idx + 1),
          ch.avatar,
          ch.name,
          subParts.join(" · "),
          right,
          {
            href: ch.url || undefined,
            avatar: true,
          },
        );
      }),
    );
  }

  if (filteredVisits.length === 0) {
    channelsRecentListEl.replaceChildren();
    channelsRecentEmptyEl.hidden = false;
  } else {
    channelsRecentEmptyEl.hidden = true;
    const recentVisits = [...filteredVisits]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20);
    channelsRecentListEl.replaceChildren(
      ...recentVisits.map((v) => {
        const d = new Date(v.timestamp);
        const dateStr = d.toLocaleDateString([], {
          day: "2-digit",
          month: "2-digit",
        });
        const timeStr = d.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        const src = v.source === "yt_music" ? "YT Music" : "YouTube";
        return buildTrackRow(
          "👁",
          v.avatar,
          v.name,
          `${src} · ${dateStr} ${timeStr}`,
          "Abrir ↗",
          {
            href: v.url || undefined,
            avatar: true,
          },
        );
      }),
    );
  }
}

function renderCalendar() {
  const sourceItems = cachedHistory.filter((it) => matchesFilter(it, false));

  const byDateMap = new Map();
  for (const item of sourceItems) {
    const key = toDateKey(new Date(item.timestamp));
    if (!byDateMap.has(key)) byDateMap.set(key, []);
    byDateMap.get(key).push(item);
  }

  const monthDate = new Date(calYear, calMonth, 1);
  const monthName = new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(monthDate);
  calMonthLabel.textContent = monthName;

  const shortMonth = new Intl.DateTimeFormat("es-AR", {
    month: "short",
  }).format(monthDate);
  calWeeksTitle.textContent = `Top por semana de ${monthName.split(" ")[0]}`;

  const firstWeekday = monthDate.getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const prevMonthDays = new Date(calYear, calMonth, 0).getDate();
  const todayKey = toDateKey(new Date());

  const cells = [];
  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({
      date: new Date(calYear, calMonth - 1, prevMonthDays - i),
      otherMonth: true,
    });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: new Date(calYear, calMonth, day), otherMonth: false });
  }
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    cells.push({ date: new Date(calYear, calMonth + 1, i), otherMonth: true });
  }

  calGrid.replaceChildren(
    ...cells.map(({ date, otherMonth }) => {
      const key = toDateKey(date);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cal-day";
      btn.textContent = String(date.getDate());
      if (otherMonth) btn.classList.add("other-month");
      if (key === todayKey) btn.classList.add("today");
      if (byDateMap.has(key)) btn.classList.add("has-activity");
      if (key === selectedDateKey) btn.classList.add("selected");
      btn.addEventListener("click", () => {
        selectedDateKey = key;
        if (otherMonth) {
          calYear = date.getFullYear();
          calMonth = date.getMonth();
        }
        renderCalendar();
      });
      return btn;
    }),
  );

  const [sy, sm, sd] = selectedDateKey.split("-").map(Number);
  const selDateObj = new Date(sy, sm - 1, sd);
  const formattedDay = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(selDateObj);

  const dayItems = (byDateMap.get(selectedDateKey) || [])
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp);
  const dayTotalSec = dayItems.reduce((acc, it) => acc + (it.seconds || 0), 0);

  calDayTitle.textContent =
    dayItems.length > 0
      ? `${formattedDay} · ${formatDuration(dayTotalSec)} (${dayItems.length}x)`
      : formattedDay;

  if (dayItems.length === 0) {
    calDayList.replaceChildren();
    calDayEmpty.hidden = false;
  } else {
    calDayEmpty.hidden = true;
    calDayList.replaceChildren(
      ...dayItems.map((item) => {
        const timeStr = new Date(item.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        const sub = `${item.artist} · ${timeStr}${item.isLoop ? " · 🔁 Bucle" : ""}`;
        const right = item.seconds > 0 ? formatClock(item.seconds) : "Takeout";
        return buildTrackRow(
          item.isLoop ? "🔁" : "•",
          item.artwork,
          item.title,
          sub,
          right,
          {
            href: resolveVideoUrl(item) || undefined,
          },
        );
      }),
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

  const monthItems = sourceItems.filter((item) => {
    const d = new Date(item.timestamp);
    return d.getFullYear() === calYear && d.getMonth() === calMonth;
  });

  calWeeksList.replaceChildren(
    ...weekRanges.map((w) => {
      const wItems = monthItems.filter((item) => {
        const day = new Date(item.timestamp).getDate();
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
      const weekVideoIds = topWeek
        .map((t) => t.videoId)
        .filter(Boolean)
        .slice(0, 20);
      if (weekVideoIds.length > 0) {
        const plBtn = document.createElement("button");
        plBtn.className = "mini-btn";
        plBtn.textContent = "▶";
        plBtn.title = "Crear playlist de esta semana";
        plBtn.addEventListener("click", () =>
          openInstantPlaylist(weekVideoIds),
        );
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

// --- IMPORTAR TAKEOUT / BACKUP ---
function showImportMessage(msg) {
  importStatus.textContent = msg;
  importStatus.hidden = false;
  setTimeout(() => {
    importStatus.hidden = true;
  }, 6000);
}

function parseTakeoutJson(entries) {
  const imported = [];
  for (const item of entries) {
    if (!item || !item.titleUrl || !item.time) continue;
    if (item.details?.some((d) => String(d.name || "").includes("Ads")))
      continue;

    let videoId = "";
    let contentType = "video";
    try {
      const u = new URL(item.titleUrl);
      videoId = u.searchParams.get("v") || "";
      if (!videoId) {
        const m = u.pathname.match(/^\/(?:shorts|live)\/([^/?#]+)/);
        if (m) videoId = m[1];
      }
      if (u.pathname.startsWith("/shorts/")) contentType = "short";
    } catch {
      continue;
    }

    if (!videoId) continue;

    const isYtMusic = item.header === "YouTube Music";
    if (isYtMusic && contentType === "video") contentType = "music";

    const rawTitle = String(item.title || "");
    const cleanTitle = rawTitle
      .replace(/^(Watched|Has visto|Viste|Escuchaste|Listened to)\s+/i, "")
      .trim();
    if (!cleanTitle) continue;

    const artist = item.subtitles?.[0]?.name?.trim() || "YouTube";
    const channelUrl = item.subtitles?.[0]?.url || "";
    const ts = new Date(item.time).getTime();
    if (!Number.isFinite(ts)) continue;

    imported.push({
      id: `takeout-${ts}-${videoId}`,
      trackKey: isYtMusic
        ? `ytm::${cleanTitle.toLowerCase()}::${artist.toLowerCase()}`
        : `yt::${videoId}::${cleanTitle.toLowerCase()}`,
      videoId,
      videoUrl: item.titleUrl,
      title: cleanTitle,
      artist,
      album: "",
      artwork: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      channelUrl,
      source: isYtMusic ? "yt_music" : "youtube",
      contentType,
      context: "direct",
      playlistId: "",
      duration: 0,
      completionPct: null,
      playbackRate: 1,
      mostlyMuted: false,
      seconds: 0,
      isLoop: false,
      imported: true,
      timestamp: ts,
    });
  }
  return imported;
}

importBtn.addEventListener("click", () => {
  // En Chrome, abrir un selector de archivos dentro de un popup lo cierra automáticamente.
  // Si no estamos en pestaña completa, abrimos el modo completo primero.
  if (!isFullMode) {
    window.open(chrome.runtime.getURL("popup.html?full=1&import=1"), "_blank");
    return;
  }
  importInput.click();
});

importInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const data = await chrome.storage.local.get({
      history: [],
      channelVisits: [],
      skips: [],
    });

    let addedCount = 0;

    if (Array.isArray(parsed)) {
      // Formato Google Takeout (watch-history.json)
      const takeoutItems = parseTakeoutJson(parsed);
      const existingIds = new Set(data.history.map((h) => h.id));
      for (const it of takeoutItems) {
        if (!existingIds.has(it.id)) {
          data.history.push(it);
          existingIds.add(it.id);
          addedCount += 1;
        }
      }
      await chrome.storage.local.set({ history: data.history });
      showImportMessage(
        `✓ Importadas ${addedCount} reproducciones de Google Takeout.`,
      );
    } else if (parsed && Array.isArray(parsed.history)) {
      // Backup propio de la extensión
      const existingIds = new Set(data.history.map((h) => h.id));
      for (const it of parsed.history) {
        if (it?.id && !existingIds.has(it.id)) {
          data.history.push(it);
          existingIds.add(it.id);
          addedCount += 1;
        }
      }

      if (Array.isArray(parsed.channelVisits)) {
        const chIds = new Set(data.channelVisits.map((c) => c.id));
        for (const c of parsed.channelVisits) {
          if (c?.id && !chIds.has(c.id)) {
            data.channelVisits.push(c);
            chIds.add(c.id);
          }
        }
      }

      if (Array.isArray(parsed.skips)) {
        const skIds = new Set(data.skips.map((s) => s.id));
        for (const s of parsed.skips) {
          if (s?.id && !skIds.has(s.id)) {
            data.skips.push(s);
            skIds.add(s.id);
          }
        }
      }

      await chrome.storage.local.set({
        history: data.history,
        channelVisits: data.channelVisits,
        skips: data.skips,
      });
      showImportMessage(`✓ Backup restaurado (+${addedCount} reproducciones).`);
    } else {
      alert(
        "El archivo JSON no tiene formato de Google Takeout ni de backup de esta extensión.",
      );
    }
  } catch (err) {
    alert("Error leyendo el archivo JSON: " + err.message);
  } finally {
    importInput.value = "";
  }
});

expandBtn.addEventListener("click", () => {
  window.open(chrome.runtime.getURL("popup.html?full=1"), "_blank");
});

makePlaylistBtn.addEventListener("click", () => {
  openInstantPlaylist(currentTopVideoIds);
});

// Navegación del calendario
calPrevBtn.addEventListener("click", () => {
  calMonth -= 1;
  if (calMonth < 0) {
    calMonth = 11;
    calYear -= 1;
  }
  selectedDateKey = toDateKey(new Date(calYear, calMonth, 1));
  renderCalendar();
});

calNextBtn.addEventListener("click", () => {
  calMonth += 1;
  if (calMonth > 11) {
    calMonth = 0;
    calYear += 1;
  }
  selectedDateKey = toDateKey(new Date(calYear, calMonth, 1));
  renderCalendar();
});

calTodayBtn.addEventListener("click", () => {
  const today = new Date();
  calYear = today.getFullYear();
  calMonth = today.getMonth();
  selectedDateKey = toDateKey(today);
  renderCalendar();
});

// Tabs
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => {
      p.hidden = true;
      p.classList.remove("active");
    });

    btn.classList.add("active");
    const target = document.getElementById(`tab-${btn.dataset.tab}`);
    target.hidden = false;
    target.classList.add("active");
  });
});

async function init() {
  const {
    history = [],
    channelVisits = [],
    skips = [],
    nowPlaying = null,
  } = await chrome.storage.local.get({
    history: [],
    channelVisits: [],
    skips: [],
    nowPlaying: null,
  });
  cachedChannelVisits = channelVisits;
  cachedSkips = skips;
  renderNowPlaying(nowPlaying);
  renderHistory(history);

  if (isFullMode && urlParams.get("import") === "1") {
    showImportMessage(
      "Modo completo abierto: tocá «Importar» para elegir tu archivo JSON.",
    );
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.nowPlaying) renderNowPlaying(changes.nowPlaying.newValue);
  if (changes.channelVisits) {
    cachedChannelVisits = changes.channelVisits.newValue || [];
    renderChannels();
  }
  if (changes.skips) {
    cachedSkips = changes.skips.newValue || [];
    renderSkips();
  }
  if (changes.history) {
    renderHistory(changes.history.newValue || []);
  }
});

periodSelect.addEventListener("change", init);
sourceSelect.addEventListener("change", init);

exportBtn.addEventListener("click", async () => {
  const {
    history = [],
    channelVisits = [],
    skips = [],
  } = await chrome.storage.local.get({
    history: [],
    channelVisits: [],
    skips: [],
  });
  const payload = { history, channelVisits, skips };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `youtube-recap-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

clearBtn.addEventListener("click", async () => {
  if (
    confirm(
      "¿Seguro que querés borrar todo el historial, skips y visitas a canales?",
    )
  ) {
    await chrome.storage.local.set({
      history: [],
      channelVisits: [],
      skips: [],
    });
  }
});

init();
