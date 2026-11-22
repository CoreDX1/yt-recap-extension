// src/utils.js
export const CATEGORY_LABELS = {
  Music: "Música",
  Gaming: "Videojuegos",
  Entertainment: "Entretenimiento",
  "Science & Technology": "Ciencia y Tech",
  Education: "Educación",
  "People & Blogs": "Personas y Blogs",
  Comedy: "Comedia",
  "News & Politics": "Noticias",
  Sports: "Deportes",
  "Film & Animation": "Cine y Animación",
  "Howto & Style": "Tutoriales",
  "Autos & Vehicles": "Autos",
  "Pets & Animals": "Mascotas",
  "Travel & Events": "Viajes",
  Trailers: "Tráilers",
  Shows: "Programas",
  Movies: "Películas",
  "Anime & Animation": "Anime y Animación",
  "Nonprofits & Activism": "ONG y Activismo",
};

export function translateCategory(cat) {
  return cat ? CATEGORY_LABELS[cat] || cat : "";
}

export function isTopicChannelName(name) {
  return /[-–—]\s*(topic|tema)\s*$/i.test(String(name || "").trim());
}

// Regla amplia (la misma que content.js): categoría Music || musicVideoType
// presente || canal - Topic. content.js mantiene una copia porque es un content
// script clásico (no módulo). PARIDAD: si cambiás esta regla, actualizá
// detectIsMusicContent() en content.js (mismo orden de condiciones).
export function computeIsMusicFlag(category, musicVideoType, artist) {
  return (
    category === "Music" ||
    Boolean(musicVideoType) ||
    isTopicChannelName(artist)
  );
}

export function isMusicItem(item) {
  return (
    item?.source === "yt_music" ||
    item?.isMusic === true ||
    item?.contentType === "music"
  );
}

export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function extractIdFromItem(item) {
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
  if (item.trackKey?.startsWith("yt::")) {
    const parts = item.trackKey.split("::");
    if (parts[1]?.length >= 8) return parts[1];
  }
  return "";
}

export function getGroupKey(item) {
  const normTitle = (item.title || "").trim().toLowerCase();
  if (item.source === "yt_music") {
    return `ytm::${normTitle}::${(item.artist || "").trim().toLowerCase()}`;
  }
  const vid = extractIdFromItem(item);
  return vid
    ? `yt::${vid}::${normTitle}`
    : `${item.source || "yt"}::${normTitle}`;
}

export function resolveVideoUrl(item) {
  if (item.videoUrl) return item.videoUrl;
  const vid = extractIdFromItem(item);
  if (!vid) return "";
  return item.source === "yt_music"
    ? `https://music.youtube.com/watch?v=${vid}`
    : `https://www.youtube.com/watch?v=${vid}`;
}

export function openInstantPlaylist(videoIds) {
  const uniqueIds = [...new Set(videoIds.filter(Boolean))].slice(0, 50);
  if (uniqueIds.length === 0) return;
  window.open(
    `https://www.youtube.com/watch_videos?video_ids=${uniqueIds.join(",")}`,
    "_blank",
  );
}

export function formatClock(secs) {
  const s = Math.max(0, Math.floor(secs));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${String(rem).padStart(2, "0")}`;
}

export function formatDuration(totalSeconds) {
  const mins = Math.round(totalSeconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${rem}m`;
}

// Fuente única de formato fecha+hora: es-AR, 24 h (igual que relativeTime.js).
const SHORT_DT_FMT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
export function formatShortDateTime(ts) {
  return SHORT_DT_FMT.format(new Date(ts));
}

export function computeStreak(items) {
  if (items.length === 0) return 0;
  const days = new Set(items.map((it) => toDateKey(new Date(it.timestamp))));
  const cursor = new Date();
  // Si hoy no tiene actividad, la racha puede seguir viva desde ayer.
  if (!days.has(toDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(toDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Filtro de formato puro: "no_shorts"/"short"/"live" no aplican scope musical.
export function matchesFilter(
  item,
  periodValue,
  sourceValue,
  checkDate = true,
) {
  if (checkDate && periodValue !== "all") {
    const cutoff = Date.now() - Number(periodValue) * 24 * 60 * 60 * 1000;
    if (item.timestamp < cutoff) return false;
  }
  const cType =
    item.contentType || (item.source === "yt_music" ? "music" : "video");
  if (sourceValue === "yt_music") return isMusicItem(item);
  if (sourceValue === "youtube")
    return item.source === "youtube" && !isMusicItem(item);
  if (sourceValue === "no_shorts") return cType !== "short";
  if (sourceValue === "short") return cType === "short";
  if (sourceValue === "live") return cType === "live";
  return true;
}

export function matchesPeriodAndSourceOnly(
  item,
  periodValue,
  sourceValue,
  checkDate = true,
) {
  if (checkDate && periodValue !== "all") {
    const cutoff = Date.now() - Number(periodValue) * 24 * 60 * 60 * 1000;
    if (item.timestamp < cutoff) return false;
  }
  if (sourceValue === "yt_music") return isMusicItem(item);
  if (sourceValue === "youtube")
    return item.source === "youtube" && !isMusicItem(item);
  return true;
}

export function aggregateTracks(items, sortBy = "plays") {
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
  const list = [...map.values()];
  // Rankings de tiempo ordenan por segundos (los importados con seconds:0
  // ya no desplazan a las reproducciones reales).
  if (sortBy === "seconds") {
    list.sort((a, b) => b.seconds - a.seconds || b.plays - a.plays);
  } else {
    list.sort((a, b) => b.plays - a.plays || b.seconds - a.seconds);
  }
  return list;
}

export function sanitizeFileSlug(text) {
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

export function getExtFromMime(mime = "") {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

// ---------- Índice en memoria (F2) ----------
// Se construye una sola vez por cambio de datos. Las vistas piden buckets
// en vez de re-filtrar el array completo en cada render.
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export function buildIndex(store) {
  const byDay = new Map();
  const byMonth = new Map();
  const bucket = (map, k) => {
    let b = map.get(k);
    if (!b) {
      b = { plays: [], inter: [], searches: [], visits: [], skips: [], sec: 0 };
      map.set(k, b);
    }
    return b;
  };
  const put = (item, kind) => {
    const d = new Date(item.timestamp);
    const dk = toDateKey(d);
    const mk = `${d.getFullYear()}-${d.getMonth()}`;
    bucket(byDay, dk)[kind].push(item);
    bucket(byMonth, mk)[kind].push(item);
    if (kind === "plays") {
      const s = item.seconds || 0;
      byDay.get(dk).sec += s;
      byMonth.get(mk).sec += s;
    }
  };
  for (const p of store.history) put(p, "plays");
  for (const it of store.interactions) put(it, "inter");
  for (const s of store.searches) put(s, "searches");
  for (const v of store.channelVisits) put(v, "visits");
  for (const sk of store.skips) put(sk, "skips");

  // Firma incremental sobre TODOS los datos (cualquier cambio la altera).
  let sig = 0;
  const mix = (s) => {
    sig = (sig * 31 + hashStr(s)) | 0;
  };
  for (const p of store.history)
    mix(
      `${p.id}|${p.seconds}|${p.title}|${p.artist}|${p.category}|${p.isMusic ? 1 : 0}|${p.contentType}`,
    );
  for (const it of store.interactions) mix(`${it.id}|${it.type}`);
  for (const s of store.searches) mix(s.id);
  for (const v of store.channelVisits) mix(v.id);
  for (const sk of store.skips) mix(sk.id);

  return { byDay, byMonth, sig };
}
