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
const exportImgBtn = document.getElementById("exportImgBtn");
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
const calMonthTopTitle = document.getElementById("calMonthTopTitle");
const calMonthImgBtn = document.getElementById("calMonthImgBtn");
const calMonthPlaylistBtn = document.getElementById("calMonthPlaylistBtn");
const calMonthTopList = document.getElementById("calMonthTopList");
const calMonthTopEmpty = document.getElementById("calMonthTopEmpty");
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
let currentMonthTopVideoIds = [];
let summaryCardData = null;
let monthCardData = null;

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
    exportImgBtn.hidden = true;
    makePlaylistBtn.hidden = true;
    summaryCardData = null;
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

    const topArtistEntry = [...artistsMap.entries()].sort(
      (a, b) => b[1].seconds - a[1].seconds || b[1].plays - a[1].plays,
    )[0];
    const periodLabel =
      periodSelect.options[periodSelect.selectedIndex]?.text || "Mi Recap";
    summaryCardData = {
      subtitle: periodLabel.toUpperCase(),
      topTracks: topTracksAll.slice(0, 5),
      totalSeconds,
      totalPlays: filtered.length,
      totalLoops,
      topArtist: topArtistEntry ? topArtistEntry[0] : "—",
    };
    exportImgBtn.hidden = topTracksAll.length === 0;

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

  const rawMonthWord = new Intl.DateTimeFormat("es-AR", {
    month: "long",
  }).format(monthDate);
  const shortMonth = new Intl.DateTimeFormat("es-AR", {
    month: "short",
  }).format(monthDate);
  calWeeksTitle.textContent = `Top por semana de ${rawMonthWord}`;

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

  const monthItems = sourceItems.filter((item) => {
    const d = new Date(item.timestamp);
    return d.getFullYear() === calYear && d.getMonth() === calMonth;
  });

  // Top del mes
  const monthTotalSec = monthItems.reduce(
    (acc, it) => acc + (it.seconds || 0),
    0,
  );
  const monthLoops = monthItems.filter((it) => it.isLoop).length;

  calMonthTopTitle.textContent =
    monthItems.length > 0
      ? `Top de ${rawMonthWord} · ${formatDuration(monthTotalSec)} (${monthItems.length}x${monthLoops > 0 ? ` · 🔁${monthLoops}` : ""})`
      : `Top de ${rawMonthWord}`;

  if (monthItems.length === 0) {
    currentMonthTopVideoIds = [];
    monthCardData = null;
    calMonthImgBtn.hidden = true;
    calMonthPlaylistBtn.hidden = true;
    calMonthTopList.replaceChildren();
    calMonthTopEmpty.hidden = false;
  } else {
    calMonthTopEmpty.hidden = true;
    const topMonth = aggregateTracks(monthItems);
    currentMonthTopVideoIds = topMonth
      .map((t) => t.videoId)
      .filter(Boolean)
      .slice(0, 20);
    calMonthPlaylistBtn.hidden = currentMonthTopVideoIds.length === 0;

    const monthArtists = new Map();
    for (const it of monthItems) {
      const k = it.artist || "YouTube";
      monthArtists.set(k, (monthArtists.get(k) || 0) + (it.seconds || 1));
    }
    const topMonthArtist =
      [...monthArtists.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    monthCardData = {
      subtitle: `${rawMonthWord.toUpperCase()} ${calYear}`,
      topTracks: topMonth.slice(0, 5),
      totalSeconds: monthTotalSec,
      totalPlays: monthItems.length,
      totalLoops: monthLoops,
      topArtist: topMonthArtist,
    };
    calMonthImgBtn.hidden = topMonth.length === 0;

    calMonthTopList.replaceChildren(
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

  // Top por semana
  const weekRanges = [
    { num: 1, start: 1, end: 7 },
    { num: 2, start: 8, end: 14 },
    { num: 3, start: 15, end: 21 },
    { num: 4, start: 22, end: 28 },
  ];
  if (daysInMonth > 28)
    weekRanges.push({ num: 5, start: 29, end: daysInMonth });

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

// --- EXPORTAR TARJETA PNG (1080x1350) ---
async function loadImageBitmapSafe(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

function drawCoverRounded(ctx, bitmap, x, y, w, h, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.clip();

  if (bitmap) {
    const sw = bitmap.width;
    const sh = bitmap.height;
    const srcRatio = sw / sh;
    const dstRatio = w / h;
    let sx = 0,
      sy = 0,
      cw = sw,
      ch = sh;
    if (srcRatio > dstRatio) {
      cw = sh * dstRatio;
      sx = (sw - cw) / 2;
    } else {
      ch = sw / dstRatio;
      sy = (sh - ch) / 2;
    }
    ctx.drawImage(bitmap, sx, sy, cw, ch, x, y, w, h);
  } else {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, "#3b1d2e");
    g.addColorStop(1, "#1e2238");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

function fitCanvasText(ctx, text, maxWidth) {
  const str = String(text || "");
  if (ctx.measureText(str).width <= maxWidth) return str;
  let out = str;
  while (out.length > 1 && ctx.measureText(out + "…").width > maxWidth) {
    out = out.slice(0, -1);
  }
  return out + "…";
}

async function renderRecapPngBlob(cardData) {
  if (!cardData || cardData.topTracks.length === 0) return null;

  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#120c14");
  bg.addColorStop(0.5, "#0d0d12");
  bg.addColorStop(1, "#160e16");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow1 = ctx.createRadialGradient(180, 180, 20, 180, 180, 460);
  glow1.addColorStop(0, "rgba(255, 78, 69, 0.28)");
  glow1.addColorStop(1, "rgba(255, 78, 69, 0)");
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(920, 1100, 20, 920, 1100, 520);
  glow2.addColorStop(0, "rgba(255, 153, 204, 0.22)");
  glow2.addColorStop(1, "rgba(255, 153, 204, 0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  const bitmaps = await Promise.all(
    cardData.topTracks.map((t) => loadImageBitmapSafe(t.artwork)),
  );

  ctx.fillStyle = "#ff85b3";
  ctx.font = "700 26px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("YOUTUBE & YT MUSIC RECAP", 72, 92);

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 58px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(fitCanvasText(ctx, cardData.subtitle, W - 144), 72, 162);

  const top1 = cardData.topTracks[0];
  ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(72, 204, W - 144, 290, 28);
  ctx.fill();
  ctx.stroke();

  drawCoverRounded(ctx, bitmaps[0], 102, 234, 230, 230, 20);

  ctx.fillStyle = "#ff6b63";
  ctx.font = "700 22px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("#1 MÁS REPRODUCIDO", 362, 276);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 38px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(fitCanvasText(ctx, top1.title, 610), 362, 334);

  ctx.fillStyle = "#bbbbcc";
  ctx.font = "500 28px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(fitCanvasText(ctx, top1.artist, 610), 362, 382);

  const top1Mins =
    top1.seconds > 0
      ? `${Math.max(1, Math.round(top1.seconds / 60))} min`
      : "Importado";
  const top1Meta = `${top1.plays}x reproducciones${top1.loops > 0 ? ` · 🔁 ${top1.loops} bucles` : ""} · ${top1Mins}`;
  ctx.fillStyle = "#86efac";
  ctx.font = "600 24px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(top1Meta, 362, 438);

  const kpis = [
    ["TIEMPO TOTAL", formatDuration(cardData.totalSeconds)],
    ["REPRODUCCIONES", String(cardData.totalPlays)],
    ["BUCLES", `🔁 ${cardData.totalLoops}`],
  ];
  const kpiW = (W - 144 - 32) / 3;
  kpis.forEach(([label, val], idx) => {
    const kx = 72 + idx * (kpiW + 16);
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    ctx.beginPath();
    ctx.roundRect(kx, 524, kpiW, 118, 20);
    ctx.fill();

    ctx.fillStyle = "#9ca3af";
    ctx.font = "600 20px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(label, kx + 24, 566);

    ctx.fillStyle = "#ffffff";
    ctx.font = "800 38px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(val, kx + 24, 616);
  });

  ctx.fillStyle = "#d1d5db";
  ctx.font = "700 26px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("TOP DEL PERÍODO", 72, 704);

  const rest = cardData.topTracks.slice(1, 5);
  rest.forEach((track, i) => {
    const rowY = 730 + i * 112;
    ctx.fillStyle = "rgba(255, 255, 255, 0.045)";
    ctx.beginPath();
    ctx.roundRect(72, rowY, W - 144, 96, 18);
    ctx.fill();

    ctx.fillStyle = "#9ca3af";
    ctx.font = "800 28px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(String(i + 2), 98, rowY + 58);

    drawCoverRounded(ctx, bitmaps[i + 1], 144, rowY + 14, 68, 68, 12);

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 26px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(fitCanvasText(ctx, track.title, 580), 232, rowY + 44);

    ctx.fillStyle = "#9ca3af";
    ctx.font = "500 22px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(fitCanvasText(ctx, track.artist, 580), 232, rowY + 76);

    const mins =
      track.seconds > 0
        ? `${Math.max(1, Math.round(track.seconds / 60))}m`
        : "Imp.";
    const rightTxt = `${track.plays}x${track.loops > 0 ? ` (🔁${track.loops})` : ""} · ${mins}`;
    ctx.fillStyle = "#e5e7eb";
    ctx.font = "700 22px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(rightTxt, W - 98, rowY + 56);
    ctx.textAlign = "left";
  });

  ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
  ctx.beginPath();
  ctx.roundRect(72, 1200, W - 144, 86, 20);
  ctx.fill();

  ctx.fillStyle = "#9ca3af";
  ctx.font = "600 20px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("ARTISTA / CANAL TOP", 100, 1236);

  ctx.fillStyle = "#ff99cc";
  ctx.font = "700 28px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(fitCanvasText(ctx, cardData.topArtist, 580), 100, 1268);

  ctx.fillStyle = "#6b7280";
  ctx.font = "600 20px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("Tu Recap · Chrome", W - 100, 1252);
  ctx.textAlign = "left";

  bitmaps.forEach((b) => b?.close());

  return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

async function exportRecapPng(cardData, btnEl) {
  if (!cardData || cardData.topTracks.length === 0) return;
  const origText = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = "⏳...";
  try {
    const pngBlob = await renderRecapPngBlob(cardData);
    if (!pngBlob) return;
    const url = URL.createObjectURL(pngBlob);
    const a = document.createElement("a");
    a.href = url;
    const slug = cardData.subtitle.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    a.download = `recap-${slug}-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = origText;
  }
}

exportImgBtn.addEventListener("click", () =>
  exportRecapPng(summaryCardData, exportImgBtn),
);
calMonthImgBtn.addEventListener("click", () =>
  exportRecapPng(monthCardData, calMonthImgBtn),
);

// --- GENERADOR DE ZIP NATIVO EN JS PURO (STORE) ---
const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c >>> 0;
  }
  return t;
})();

function computeCrc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZipBlob(files) {
  const encoder = new TextEncoder();
  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = file.data;
    const crc = computeCrc32(data);
    const size = data.length;

    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    lh.set(nameBytes, 30);

    localParts.push(lh, data);

    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    ch.set(nameBytes, 46);

    centralParts.push(ch);
    offset += lh.length + size;
  }

  let cdSize = 0;
  for (const part of centralParts) cdSize += part.length;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, eocd], {
    type: "application/zip",
  });
}

function sanitizeFileSlug(text) {
  return (
    String(text || "imagen")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "imagen"
  );
}

function getExtFromMime(mime) {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

exportBtn.addEventListener("click", async () => {
  const origText = exportBtn.textContent;
  exportBtn.disabled = true;
  exportBtn.textContent = "⏳...";

  try {
    const {
      history = [],
      channelVisits = [],
      skips = [],
    } = await chrome.storage.local.get({
      history: [],
      channelVisits: [],
      skips: [],
    });

    const imageTasks = [];
    const seenUrls = new Set();
    const usedNames = new Set();

    function queueImage(url, folder, baseLabel) {
      if (!url || !url.startsWith("http") || seenUrls.has(url)) return;
      seenUrls.add(url);
      const slug = sanitizeFileSlug(baseLabel);
      let uniqueSlug = slug;
      let n = 2;
      while (usedNames.has(`${folder}/${uniqueSlug}`)) {
        uniqueSlug = `${slug}-${n++}`;
      }
      usedNames.add(`${folder}/${uniqueSlug}`);
      imageTasks.push({ url, folder, slug: uniqueSlug });
    }

    for (const item of history) {
      queueImage(item.artwork, "imagenes/portadas", item.videoId || item.title);
    }
    for (const ch of channelVisits) {
      queueImage(ch.avatar, "imagenes/canales", ch.name || ch.channelKey);
    }
    for (const sk of skips) {
      queueImage(sk.artwork, "imagenes/portadas", sk.videoId || sk.title);
    }

    const zipFiles = [];
    const imageMap = {};
    let doneCount = 0;

    const BATCH = 6;
    for (let i = 0; i < imageTasks.length; i += BATCH) {
      const slice = imageTasks.slice(i, i + BATCH);
      await Promise.all(
        slice.map(async (task) => {
          try {
            const res = await fetch(task.url);
            if (!res.ok) return;
            const blob = await res.blob();
            const buf = new Uint8Array(await blob.arrayBuffer());
            const ext = getExtFromMime(blob.type || "");
            const filePath = `${task.folder}/${task.slug}.${ext}`;
            zipFiles.push({ name: filePath, data: buf });
            imageMap[task.url] = filePath;
          } catch {
            // Ignorar si alguna imagen falló
          } finally {
            doneCount += 1;
            exportBtn.textContent = `⏳ ${doneCount}/${imageTasks.length}`;
          }
        }),
      );
    }

    if (summaryCardData) {
      const cardBlob = await renderRecapPngBlob(summaryCardData);
      if (cardBlob) {
        zipFiles.push({
          name: "recap-tarjeta.png",
          data: new Uint8Array(await cardBlob.arrayBuffer()),
        });
      }
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      history,
      channelVisits,
      skips,
      imageMap,
    };
    const jsonBytes = new TextEncoder().encode(
      JSON.stringify(payload, null, 2),
    );
    zipFiles.unshift({ name: "recap-backup.json", data: jsonBytes });

    const zipBlob = buildZipBlob(zipFiles);
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `youtube-recap-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = origText;
  }
});

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

calMonthPlaylistBtn.addEventListener("click", () => {
  openInstantPlaylist(currentMonthTopVideoIds);
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
