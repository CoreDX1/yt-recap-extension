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
  };
}

export function channelsVM(filteredVisits, filteredPlays, sort, minSec) {
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

export { formatDuration, toDateKey };
