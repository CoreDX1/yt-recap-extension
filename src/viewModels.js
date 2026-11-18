// src/viewModels.js
import {
  aggregateTracks,
  computeStreak,
  formatDuration,
  getGroupKey,
  resolveVideoUrl,
  extractIdFromItem,
  isMusicItem,
  toDateKey,
} from "./utils.js";

function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

export function summaryVM(filtered) {
  if (filtered.length === 0) return { empty: true };
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
  const topTracks = aggregateTracks(filtered);
  const topArtist =
    [...artistsMap.entries()].sort(
      (a, b) => b[1].seconds - a[1].seconds || b[1].plays - a[1].plays,
    )[0]?.[0] || "—";
  const maxHourSec = Math.max(...hoursBuckets);
  const peakIdx = hoursBuckets.indexOf(maxHourSec);
  return {
    empty: false,
    totalSeconds,
    totalPlays: filtered.length,
    totalLoops,
    unique: topTracks.length,
    streak: computeStreak(filtered),
    peakLabel: maxHourSec > 0 ? `${String(peakIdx).padStart(2, "0")}:00h` : "—",
    topTracks,
    topArtist,
  };
}

export function activityVM(
  filtered,
  filteredInter,
  filteredSearches,
  filteredSkips,
) {
  const likesCount = filteredInter.filter((it) => it.type === "like").length;
  const subsCount = filteredInter.filter(
    (it) => it.type === "subscribe",
  ).length;
  const hours = new Array(24).fill(0);
  const formatCounts = { video: 0, music: 0, short: 0, live: 0 };
  const contextCounts = { direct: 0, mix: 0, playlist: 0 };
  const categoriesMap = new Map();
  const artistsMap = new Map();
  const albumsMap = new Map();
  let rateSum = 0;
  let rateCount = 0;

  for (const item of filtered) {
    hours[new Date(item.timestamp).getHours()] += item.seconds || 0;
    const cType =
      item.contentType || (item.source === "yt_music" ? "music" : "video");
    formatCounts[cType] = (formatCounts[cType] || 0) + 1;
    const ctx = item.context || "direct";
    contextCounts[ctx] = (contextCounts[ctx] || 0) + 1;
    const catKey = item.category || (isMusicItem(item) ? "Music" : "");
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

  const catSorted = [...categoriesMap.entries()].sort(
    (a, b) => b[1].seconds - a[1].seconds || b[1].plays - a[1].plays,
  );
  const totalWeight = catSorted.reduce(
    (acc, [, st]) => acc + (st.seconds || st.plays),
    0,
  );
  const catEntries = catSorted.slice(0, 6).map(([cat, st]) => ({
    cat,
    plays: st.plays,
    seconds: st.seconds,
    pct:
      totalWeight > 0
        ? Math.max(
            4,
            Math.round(((st.seconds || st.plays) / totalWeight) * 100),
          )
        : 0,
  }));

  const avgRate =
    rateCount > 0
      ? `${(rateSum / rateCount).toFixed(2).replace(/\.00$/, "")}x`
      : "1x";
  const musicCount = filtered.filter(isMusicItem).length;
  const musicOnYouTube = filtered.filter(
    (it) => it.source === "youtube" && isMusicItem(it),
  ).length;
  const videosNonMusic = filtered.filter((it) => {
    const cType =
      it.contentType || (it.source === "yt_music" ? "music" : "video");
    return cType === "video" && !isMusicItem(it);
  }).length;

  const chips = [
    ["Música", musicCount],
    ["Música en YouTube", musicOnYouTube],
    ["Videos (no música)", videosNonMusic],
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
  const topSearches = [...sMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const topAlbums = [...albumsMap.values()]
    .sort((a, b) => b.plays - a.plays || b.seconds - a.seconds)
    .slice(0, 5);
  const topArtists = [...artistsMap.entries()]
    .sort((a, b) => b[1].seconds - a[1].seconds || b[1].plays - a[1].plays)
    .slice(0, 5)
    .map(([name, st]) => ({ name, ...st }));

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

  return {
    hours,
    maxHour: Math.max(...hours),
    catEntries,
    chips,
    topSearches,
    topAlbums,
    topArtists,
    topSkips,
    likesCount,
    subsCount,
    searchesCount: filteredSearches.length,
    avgRate,
    mixCount: (contextCounts.mix || 0) + (contextCounts.playlist || 0),
  };
}

export function channelsVM(filteredVisits, filteredPlays, sort, minSec) {
  const channelsMap = new Map();
  const getCh = (key, name) => {
    if (!channelsMap.has(key))
      channelsMap.set(key, {
        name: name || "Canal",
        avatar: "",
        url: "",
        visits: 0,
        plays: 0,
        seconds: 0,
      });
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
  const allChannels = [...channelsMap.values()];
  const withTimeRaw = allChannels
    .filter((c) => c.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds || b.plays - a.plays);
  const totalChannelsSec = withTimeRaw.reduce((acc, c) => acc + c.seconds, 0);
  const maxTimeSec = withTimeRaw[0]?.seconds || 0;
  const withTime = withTimeRaw.slice(0, 15).map((ch) => ({
    ...ch,
    sharePct:
      totalChannelsSec > 0
        ? Math.round((ch.seconds / totalChannelsSec) * 100)
        : 0,
    barPct: maxTimeSec > 0 ? Math.round((ch.seconds / maxTimeSec) * 100) : 0,
  }));
  const filtered = allChannels.filter((ch) => ch.seconds >= minSec);
  filtered.sort((a, b) => {
    if (sort === "time")
      return b.seconds - a.seconds || b.plays - a.plays || b.visits - a.visits;
    if (sort === "plays")
      return b.plays - a.plays || b.seconds - a.seconds || b.visits - a.visits;
    return b.visits - a.visits || b.seconds - a.seconds || b.plays - a.plays;
  });
  const maxRankSec = Math.max(0, ...filtered.map((c) => c.seconds));
  const ranked = filtered.slice(0, 25).map((ch) => {
    const subParts = [];
    if (ch.visits > 0)
      subParts.push(
        `👁️ ${ch.visits} ${ch.visits === 1 ? "visita" : "visitas"}`,
      );
    if (ch.plays > 0) subParts.push(`▶ ${ch.plays} rep.`);
    if (subParts.length === 0) subParts.push("Sin datos");
    return {
      ...ch,
      sub: subParts.join(" · "),
      barPct:
        maxRankSec > 0 && ch.seconds > 0
          ? Math.round((ch.seconds / maxRankSec) * 100)
          : 0,
    };
  });
  const recent = [...filteredVisits]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 20);
  return {
    unique: allChannels.length,
    totalVisits: filteredVisits.length,
    withTime,
    ranked,
    recent,
    allChannels,
  };
}

export function likesVM(filteredInter, filteredSearches) {
  return {
    likes: filteredInter
      .filter((it) => it.type === "like")
      .sort((a, b) => b.timestamp - a.timestamp),
    subs: filteredInter
      .filter((it) => it.type === "subscribe")
      .sort((a, b) => b.timestamp - a.timestamp),
    searches: [...filteredSearches].sort((a, b) => b.timestamp - a.timestamp),
  };
}

export function homeVM(periodPlays, allPlays, inter, searches, visits) {
  const top = aggregateTracks(periodPlays).slice(0, 12);
  const likedKeys = new Set();
  for (const it of inter) {
    if (it.type !== "like") continue;
    if (it.videoId) likedKeys.add(it.videoId);
    if (it.targetKey) likedKeys.add(it.targetKey);
  }
  const forgotMap = new Map();
  for (const p of allPlays) {
    const key = getGroupKey(p);
    const cur = forgotMap.get(key) || {
      title: p.title,
      artist: p.artist,
      artwork: p.artwork,
      videoUrl: resolveVideoUrl(p),
      videoId: extractIdFromItem(p),
      plays: 0,
      lastTs: 0,
      liked: false,
    };
    cur.plays += 1;
    cur.lastTs = Math.max(cur.lastTs, p.timestamp);
    if (likedKeys.has(p.videoId) || likedKeys.has(key)) cur.liked = true;
    if (!cur.artwork && p.artwork) cur.artwork = p.artwork;
    forgotMap.set(key, cur);
  }
  const cutoff = Date.now() - 30 * 86400000;
  const forgotten = [...forgotMap.values()]
    .filter((t) => (t.plays >= 2 || t.liked) && t.lastTs < cutoff)
    .sort((a, b) => b.plays - a.plays || b.lastTs - a.lastTs)
    .slice(0, 12);

  const artistsMap = new Map();
  const albumsMap = new Map();
  for (const p of periodPlays) {
    const ak = p.artist || "Desconocido";
    const a = artistsMap.get(ak) || {
      name: ak,
      plays: 0,
      seconds: 0,
      artwork: p.artwork,
      url: p.channelUrl || "",
    };
    a.plays += 1;
    a.seconds += p.seconds || 0;
    if (!a.artwork && p.artwork) a.artwork = p.artwork;
    if (!a.url && p.channelUrl) a.url = p.channelUrl;
    artistsMap.set(ak, a);
    if (p.album) {
      const k = `${p.album.toLowerCase()}::${ak.toLowerCase()}`;
      const al = albumsMap.get(k) || {
        album: p.album,
        artist: p.artist,
        artwork: p.artwork,
        plays: 0,
        seconds: 0,
      };
      al.plays += 1;
      al.seconds += p.seconds || 0;
      if (!al.artwork && p.artwork) al.artwork = p.artwork;
      albumsMap.set(k, al);
    }
  }
  const artists = [...artistsMap.values()]
    .sort((a, b) => b.seconds - a.seconds || b.plays - a.plays)
    .slice(0, 12);
  const albums = [...albumsMap.values()]
    .sort((a, b) => b.plays - a.plays || b.seconds - a.seconds)
    .slice(0, 12);

  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    let plays = 0;
    let seconds = 0;
    for (const p of allPlays) {
      const pd = new Date(p.timestamp);
      if (pd.getFullYear() === y && pd.getMonth() === m) {
        plays += 1;
        seconds += p.seconds || 0;
      }
    }
    months.push({
      y,
      m,
      label: new Intl.DateTimeFormat("es-AR", { month: "long" }).format(d),
      year: y,
      plays,
      seconds,
    });
  }

  const recent = [...periodPlays]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 12);
  const shorts = periodPlays
    .filter((p) => p.contentType === "short")
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 12);
  const lives = periodPlays
    .filter((p) => p.contentType === "live")
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 12);
  const recentSearches = [...searches]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 12);

  const chMap = new Map();
  for (const p of periodPlays) {
    const ak = p.artist || "YouTube";
    const c = chMap.get(ak) || {
      name: ak,
      plays: 0,
      seconds: 0,
      artwork: p.artwork,
      url: p.channelUrl || "",
    };
    c.plays += 1;
    c.seconds += p.seconds || 0;
    if (!c.artwork && p.artwork) c.artwork = p.artwork;
    if (!c.url && p.channelUrl) c.url = p.channelUrl;
    chMap.set(ak, c);
  }
  for (const v of visits) {
    const k = (v.name || v.channelKey || "canal").trim().toLowerCase();
    const c = chMap.get(k) || {
      name: v.name || "Canal",
      plays: 0,
      seconds: 0,
      artwork: v.avatar,
      url: v.url,
    };
    if (!c.artwork && v.avatar) c.artwork = v.avatar;
    if (!c.url && v.url) c.url = v.url;
    chMap.set(k, c);
  }
  const channels = [...chMap.values()]
    .sort((a, b) => b.seconds - a.seconds || b.plays - a.plays)
    .slice(0, 12);

  return {
    top,
    forgotten,
    artists,
    albums,
    months,
    recent,
    shorts,
    lives,
    recentSearches,
    channels,
  };
}

export function searchVM(query, scopeValue, store) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const inScope = (it) =>
    scopeValue === "yt_music"
      ? isMusicItem(it)
      : it.source === "youtube" && !isMusicItem(it);
  const match = (it) =>
    (it.title || "").toLowerCase().includes(q) ||
    (it.artist || "").toLowerCase().includes(q) ||
    (it.album || "").toLowerCase().includes(q);
  const plays = store.history.filter((it) => inScope(it) && match(it));
  const tracks = aggregateTracks(plays).slice(0, 8);
  const artistsMap = new Map();
  for (const p of plays) {
    const ak = p.artist || "Desconocido";
    if (!ak.toLowerCase().includes(q)) continue;
    const a = artistsMap.get(ak) || {
      name: ak,
      plays: 0,
      seconds: 0,
      artwork: p.artwork,
      url: p.channelUrl || "",
    };
    a.plays += 1;
    a.seconds += p.seconds || 0;
    if (!a.artwork && p.artwork) a.artwork = p.artwork;
    if (!a.url && p.channelUrl) a.url = p.channelUrl;
    artistsMap.set(ak, a);
  }
  const artists = [...artistsMap.values()]
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 6);
  const channels = store.channelVisits
    .filter(
      (v) =>
        (scopeValue === "yt_music"
          ? v.source === "yt_music"
          : v.source === "youtube") && (v.name || "").toLowerCase().includes(q),
    )
    .slice(0, 6);
  const searches = store.searches
    .filter(
      (s) =>
        (scopeValue === "yt_music"
          ? s.source === "yt_music"
          : s.source === "youtube") &&
        (s.query || "").toLowerCase().includes(q),
    )
    .slice(0, 6);
  return { tracks, artists, channels, searches };
}

/* ===================== v2.6 ===================== */

export function exploreInsightsVM(plays, prevPlays) {
  const sum = summaryVM(plays);
  const prev = summaryVM(prevPlays);
  const pct = (cur, old) =>
    old > 0 ? Math.round(((cur - old) / old) * 100) : null;
  const deltas =
    prev.empty || sum.empty
      ? null
      : {
          seconds: pct(sum.totalSeconds, prev.totalSeconds),
          plays: pct(sum.totalPlays, prev.totalPlays),
          unique: pct(sum.unique, prev.unique),
        };
  const days = 14;
  const trend = new Array(days).fill(0);
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const start = base.getTime() - (days - 1) * 86400000;
  for (const p of plays) {
    const d = new Date(p.timestamp);
    d.setHours(0, 0, 0, 0);
    const idx = Math.round((d.getTime() - start) / 86400000);
    if (idx >= 0 && idx < days) trend[idx] += p.seconds || 0;
  }
  return { sum, prev, deltas, trend, hasPrev: !prev.empty };
}

export function formatsVM(plays) {
  const c = { music: 0, video: 0, short: 0, live: 0 };
  for (const p of plays) {
    if (p.contentType === "short") c.short += 1;
    else if (p.contentType === "live") c.live += 1;
    else if (isMusicItem(p)) c.music += 1;
    else c.video += 1;
  }
  return [
    { key: "music", label: "Música", value: c.music, color: "var(--chart-1)" },
    { key: "video", label: "Videos", value: c.video, color: "var(--chart-2)" },
    { key: "short", label: "Shorts", value: c.short, color: "var(--chart-3)" },
    { key: "live", label: "Directos", value: c.live, color: "var(--chart-4)" },
  ].filter((s) => s.value > 0);
}

export function calendarHeroVM(plays, inter, searches, year) {
  let yearSeconds = 0;
  let yearPlays = 0;
  const monthSec = new Array(12).fill(0);
  const dayAny = new Set();
  for (const p of plays) {
    const d = new Date(p.timestamp);
    if (d.getFullYear() !== year) continue;
    yearSeconds += p.seconds || 0;
    yearPlays += 1;
    monthSec[d.getMonth()] += p.seconds || 0;
    dayAny.add(toDateKey(d));
  }
  for (const it of inter) {
    const d = new Date(it.timestamp);
    if (d.getFullYear() === year) dayAny.add(toDateKey(d));
  }
  for (const s of searches) {
    const d = new Date(s.timestamp);
    if (d.getFullYear() === year) dayAny.add(toDateKey(d));
  }
  const days = [...dayAny].sort();
  let maxStreak = 0,
    run = 0,
    prevT = null;
  for (const k of days) {
    const t = Date.parse(`${k}T00:00:00Z`);
    if (prevT != null && t - prevT === 86400000) run += 1;
    else run = 1;
    if (run > maxStreak) maxStreak = run;
    prevT = t;
  }
  const bestVal = Math.max(...monthSec);
  const bestIdx = monthSec.indexOf(bestVal);
  const bestMonth =
    bestVal > 0
      ? {
          label: new Intl.DateTimeFormat("es-AR", { month: "long" }).format(
            new Date(year, bestIdx, 1),
          ),
          seconds: bestVal,
          index: bestIdx,
        }
      : null;
  return {
    yearSeconds,
    yearPlays,
    activeDays: dayAny.size,
    maxStreak,
    bestMonth,
  };
}

export function artistDirectoryVM(plays, inter, sort = "time", query = "") {
  const map = new Map();
  for (const p of plays) {
    const name = p.artist || "Desconocido";
    const a = map.get(name) || {
      name,
      plays: 0,
      seconds: 0,
      artwork: "",
      url: "",
      likes: 0,
      albums: new Set(),
      lastTs: 0,
    };
    a.plays += 1;
    a.seconds += p.seconds || 0;
    a.lastTs = Math.max(a.lastTs, p.timestamp);
    if (!a.artwork && p.artwork) a.artwork = p.artwork;
    if (!a.url && p.channelUrl) a.url = p.channelUrl;
    if (p.album) a.albums.add(p.album);
    map.set(name, a);
  }
  for (const it of inter) {
    if (it.type !== "like") continue;
    const a = map.get(it.artist);
    if (a) a.likes += 1;
  }
  let list = [...map.values()].map((a) => ({ ...a, albums: a.albums.size }));
  const q = query.trim().toLowerCase();
  if (q) list = list.filter((a) => a.name.toLowerCase().includes(q));
  list.sort((a, b) => {
    if (sort === "plays") return b.plays - a.plays || b.seconds - a.seconds;
    if (sort === "name") return a.name.localeCompare(b.name, "es");
    return b.seconds - a.seconds || b.plays - a.plays;
  });
  return {
    list,
    totals: {
      count: list.length,
      seconds: list.reduce((s, a) => s + a.seconds, 0),
      plays: list.reduce((s, a) => s + a.plays, 0),
    },
  };
}

export function artistDetailVM(name, plays, inter) {
  const key = name.toLowerCase();
  const mine = plays.filter(
    (p) => (p.artist || "Desconocido").toLowerCase() === key,
  );
  const topTracks = aggregateTracks(mine).slice(0, 20);
  const albumsMap = new Map();
  const monthsMap = new Map();
  let seconds = 0,
    lastTs = 0,
    artwork = "",
    url = "";
  for (const p of mine) {
    seconds += p.seconds || 0;
    lastTs = Math.max(lastTs, p.timestamp);
    if (!artwork && p.artwork) artwork = p.artwork;
    if (!url && p.channelUrl) url = p.channelUrl;
    if (p.album) {
      const al = albumsMap.get(p.album) || {
        album: p.album,
        artist: p.artist,
        artwork: p.artwork,
        plays: 0,
        seconds: 0,
      };
      al.plays += 1;
      al.seconds += p.seconds || 0;
      if (!al.artwork && p.artwork) al.artwork = p.artwork;
      albumsMap.set(p.album, al);
    }
    const d = new Date(p.timestamp);
    const mk = `${d.getFullYear()}-${d.getMonth()}`;
    const mo = monthsMap.get(mk) || {
      y: d.getFullYear(),
      m: d.getMonth(),
      label: new Intl.DateTimeFormat("es-AR", { month: "long" }).format(d),
      year: d.getFullYear(),
      plays: 0,
      seconds: 0,
    };
    mo.plays += 1;
    mo.seconds += p.seconds || 0;
    monthsMap.set(mk, mo);
  }
  const likes = inter
    .filter(
      (it) => it.type === "like" && (it.artist || "").toLowerCase() === key,
    )
    .sort((a, b) => b.timestamp - a.timestamp);
  return {
    name: mine[0]?.artist || name,
    artwork,
    url,
    plays: mine.length,
    seconds,
    lastTs,
    topTracks,
    albums: [...albumsMap.values()].sort((a, b) => b.seconds - a.seconds),
    months: [...monthsMap.values()]
      .sort((a, b) => b.y - a.y || b.m - a.m)
      .slice(0, 12),
    likes,
    ids: topTracks.map((t) => t.videoId).filter(Boolean),
  };
}

export function channelDirectoryVM(
  plays,
  visits,
  sort = "time",
  minSec = 0,
  query = "",
) {
  const map = new Map();
  const get = (name) => {
    const k = (name || "Canal").trim().toLowerCase();
    if (!map.has(k))
      map.set(k, {
        name: name || "Canal",
        avatar: "",
        url: "",
        visits: 0,
        plays: 0,
        seconds: 0,
        lastTs: 0,
      });
    return map.get(k);
  };
  for (const p of plays) {
    const c = get(p.artist);
    c.plays += 1;
    c.seconds += p.seconds || 0;
    c.lastTs = Math.max(c.lastTs, p.timestamp);
    if (!c.avatar && p.artwork) c.avatar = p.artwork;
    if (!c.url && p.channelUrl) c.url = p.channelUrl;
  }
  for (const v of visits) {
    const c = get(v.name || v.channelKey);
    c.visits += 1;
    c.lastTs = Math.max(c.lastTs, v.timestamp);
    if (v.avatar) c.avatar = v.avatar;
    if (v.url) c.url = v.url;
  }
  let list = [...map.values()].filter((c) => c.seconds >= minSec);
  const q = query.trim().toLowerCase();
  if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));
  list.sort((a, b) => {
    if (sort === "plays")
      return b.plays - a.plays || b.seconds - a.seconds || b.visits - a.visits;
    if (sort === "visits")
      return b.visits - a.visits || b.seconds - a.seconds || b.plays - a.plays;
    return b.seconds - a.seconds || b.plays - a.plays || b.visits - a.visits;
  });
  const maxSec = Math.max(0, ...list.map((c) => c.seconds));
  list = list.map((c) => ({
    ...c,
    barPct: maxSec > 0 ? Math.round((c.seconds / maxSec) * 100) : 0,
  }));
  return {
    list,
    totals: {
      count: list.length,
      visits: list.reduce((s, c) => s + c.visits, 0),
      seconds: list.reduce((s, c) => s + c.seconds, 0),
      withTime: list.filter((c) => c.seconds > 0).length,
    },
    recent: [...visits].sort((a, b) => b.timestamp - a.timestamp).slice(0, 12),
  };
}

export function channelDetailVM(name, plays, visits) {
  const key = name.trim().toLowerCase();
  const mine = plays.filter(
    (p) => (p.artist || "").trim().toLowerCase() === key,
  );
  const myVisits = visits
    .filter((v) => (v.name || v.channelKey || "").trim().toLowerCase() === key)
    .sort((a, b) => b.timestamp - a.timestamp);
  let seconds = 0,
    avatar = "",
    url = "";
  for (const p of mine) {
    seconds += p.seconds || 0;
    if (!avatar && p.artwork) avatar = p.artwork;
    if (!url && p.channelUrl) url = p.channelUrl;
  }
  for (const v of myVisits) {
    if (v.avatar) avatar = v.avatar;
    if (v.url) url = v.url;
  }
  const dedupe = (items) => {
    const m = new Map();
    for (const it of items) {
      const k = getGroupKey(it);
      const cur = m.get(k);
      if (!cur || it.timestamp > cur.timestamp) m.set(k, it);
    }
    return [...m.values()]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 12);
  };
  return {
    name: mine[0]?.artist || myVisits[0]?.name || name,
    avatar,
    url,
    plays: mine.length,
    seconds,
    visits: myVisits.length,
    topTracks: aggregateTracks(mine).slice(0, 20),
    shorts: dedupe(mine.filter((p) => p.contentType === "short")),
    lives: dedupe(mine.filter((p) => p.contentType === "live")),
    recent: dedupe(mine),
    recentVisits: myVisits.slice(0, 12),
    ids: aggregateTracks(mine)
      .map((t) => t.videoId)
      .filter(Boolean),
  };
}

export function likesPageVM(inter, searches, plays) {
  const likes = inter
    .filter((i) => i.type === "like")
    .sort((a, b) => b.timestamp - a.timestamp);
  const subs = inter
    .filter((i) => i.type === "subscribe")
    .sort((a, b) => b.timestamp - a.timestamp);
  const groups = new Map();
  for (const s of searches) {
    const k = s.normalized || (s.query || "").toLowerCase();
    const g = groups.get(k) || {
      query: s.query,
      count: 0,
      lastTs: 0,
      url: s.url,
      source: s.source,
    };
    g.count += 1;
    if (s.timestamp > g.lastTs) {
      g.lastTs = s.timestamp;
      if (s.url) g.url = s.url;
    }
    groups.set(k, g);
  }
  const searchGroups = [...groups.values()].sort((a, b) => b.lastTs - a.lastTs);
  const collage = likes
    .map((l) => l.artwork)
    .filter(Boolean)
    .slice(0, 4);
  const ids = [...new Set(likes.map((l) => l.videoId).filter(Boolean))];
  const likedKeys = new Set();
  for (const l of likes) {
    if (l.videoId) likedKeys.add(l.videoId);
    if (l.targetKey) likedKeys.add(l.targetKey);
  }
  let seconds = 0;
  for (const p of plays)
    if (likedKeys.has(p.videoId) || likedKeys.has(getGroupKey(p)))
      seconds += p.seconds || 0;
  const oldest = likes.length ? likes[likes.length - 1].timestamp : null;
  return {
    likes,
    subs,
    searchGroups,
    collage,
    ids,
    oldest,
    totals: {
      likes: likes.length,
      subs: subs.length,
      searches: searches.length,
      groups: searchGroups.length,
      seconds,
    },
  };
}

/* ===================== v2.7 ===================== */

export function kpiMicroVM(plays, prevPlays) {
  const days = 7;
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const start = base.getTime() - (days - 1) * 86400000;
  const days7 = Array.from({ length: days }, () => ({
    seconds: 0,
    plays: 0,
    active: false,
  }));
  const hours = new Array(24).fill(0);
  let loops = 0;
  for (const p of plays) {
    const d = new Date(p.timestamp);
    hours[d.getHours()] += p.seconds || 0;
    if (p.isLoop) loops += 1;
    d.setHours(0, 0, 0, 0);
    const idx = Math.round((d.getTime() - start) / 86400000);
    if (idx >= 0 && idx < days) {
      days7[idx].seconds += p.seconds || 0;
      days7[idx].plays += 1;
      days7[idx].active = true;
    }
  }
  const unique = aggregateTracks(plays).length;
  const prevUnique = prevPlays.length ? aggregateTracks(prevPlays).length : 0;
  return {
    days7,
    hours,
    loops,
    plays: plays.length,
    unique,
    prevUnique,
    loopsRatio: plays.length ? loops / plays.length : 0,
    uniqueRatio: prevUnique
      ? Math.min(1, unique / prevUnique)
      : plays.length
        ? Math.min(1, unique / plays.length)
        : 0,
  };
}

export function prevHoursVM(prevPlays) {
  const h = new Array(24).fill(0);
  for (const p of prevPlays)
    h[new Date(p.timestamp).getHours()] += p.seconds || 0;
  return h;
}

export function yearHeatVM(plays, year) {
  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);
  const startPad = (jan1.getDay() + 6) % 7;
  const byDay = new Map();
  for (const p of plays) {
    const d = new Date(p.timestamp);
    if (d.getFullYear() !== year) continue;
    const k = toDateKey(d);
    byDay.set(k, (byDay.get(k) || 0) + (p.seconds || 0));
  }
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = new Date(jan1); d <= dec31; d.setDate(d.getDate() + 1)) {
    const sec = byDay.get(toDateKey(d)) || 0;
    const level =
      sec >= 7200 ? 4 : sec >= 2700 ? 3 : sec >= 900 ? 2 : sec > 0 ? 1 : 0;
    cells.push({ key: toDateKey(d), level });
  }
  return {
    cells,
    startPad,
    total: [...byDay.values()].reduce((a, b) => a + b, 0),
  };
}

export function insightsVM(plays, prevPlays) {
  const out = [];
  if (!plays.length) return out;
  const byDay = new Map();
  const hours = new Array(24).fill(0);
  let total = 0;
  for (const p of plays) {
    const s = p.seconds || 0;
    total += s;
    hours[new Date(p.timestamp).getHours()] += s;
    const k = toDateKey(new Date(p.timestamp));
    byDay.set(k, (byDay.get(k) || 0) + s);
  }
  const best = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] > 0) {
    const [y, m, d] = best[0].split("-").map(Number);
    const label = new Intl.DateTimeFormat("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date(y, m - 1, d));
    out.push({
      icon: "trophy",
      tone: "annotate",
      text: `Tu mejor día fue <strong>${esc(label)}</strong> con <strong>${formatDuration(best[1])}</strong>.`,
      action: { type: "calendar", y, m: m - 1, d },
    });
  }
  if (total > 0) {
    const eve = hours[19] + hours[20] + hours[21] + hours[22];
    const pct = Math.round((eve / total) * 100);
    if (pct >= 10) {
      out.push({
        icon: "moon",
        tone: "compare",
        text: `Concentrás el <strong>${pct}%</strong> de tu tiempo entre <strong>19:00 y 22:00</strong>.`,
        action: { type: "hour", h: 19 },
      });
    }
  }
  const days = [...byDay.keys()].sort();
  let maxRun = 0,
    run = 0,
    prevT = null;
  for (const k of days) {
    const t = Date.parse(`${k}T00:00:00Z`);
    if (prevT != null && t - prevT === 86400000) run += 1;
    else run = 1;
    if (run > maxRun) maxRun = run;
    prevT = t;
  }
  const cur = computeStreak(plays);
  out.push({
    icon: "flame",
    tone: "ok",
    text: `Llevás <strong>${cur} ${cur === 1 ? "día" : "días"}</strong> de racha; tu récord del período es <strong>${maxRun}</strong>.`,
    action: { type: "calendar" },
  });
  const loops = plays.filter((p) => p.isLoop).length;
  if (loops > 0) {
    out.push({
      icon: "loop",
      tone: "brand",
      text: `Repetiste <strong>${loops}</strong> reproducciones: el <strong>${Math.round((loops / plays.length) * 100)}%</strong> del total.`,
      action: { type: "none" },
    });
  }
  if (prevPlays.length) {
    const ps = prevPlays.reduce((s, p) => s + (p.seconds || 0), 0);
    if (ps > 0) {
      const pct = Math.round(((total - ps) / ps) * 100);
      out.push({
        icon: pct >= 0 ? "peak" : "chart",
        tone: pct >= 0 ? "ok" : "bad",
        text: `${pct >= 0 ? "Subiste" : "Bajaste"} <strong>${Math.abs(pct)}%</strong> de tiempo vs el período anterior.`,
        action: { type: "none" },
      });
    }
  } else {
    out.push({
      icon: "info",
      tone: "muted",
      text: "Este es tu <strong>primer período con datos</strong>: todavía no hay comparación anterior.",
      action: { type: "none" },
    });
  }
  const byArtist = new Map();
  for (const p of plays) {
    const a = p.artist || "Desconocido";
    byArtist.set(a, (byArtist.get(a) || 0) + (p.seconds || 0));
  }
  const topA = [...byArtist.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topA && total > 0) {
    const pct = Math.round((topA[1] / total) * 100);
    if (pct >= 15) {
      out.push({
        icon: "mic",
        tone: "brand",
        text: `El <strong>${pct}%</strong> de tu tiempo es de <strong>${esc(topA[0])}</strong>.`,
        action: { type: "people", name: topA[0] },
      });
    }
  }
  return out.slice(0, 5);
}

export { formatDuration, toDateKey };
