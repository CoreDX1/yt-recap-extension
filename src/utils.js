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
};

export function translateCategory(cat) {
  return cat ? CATEGORY_LABELS[cat] || cat : "";
}

// --- FASE 2: clasificación de contenido musical ---
// Canales auto-generados de artistas ("Artist - Topic" / "- Tema").
export function isTopicChannelName(name) {
  return /[-–—]\s*(topic|tema)\s*$/i.test(String(name || "").trim());
}

// Regla amplia (la misma que content.js): categoría Music (incluye
// AMVs/lyrics/covers) || musicVideoType presente || canal - Topic.
// Nota: content.js mantiene su propia copia porque es un content script
// clásico (no módulo). Si cambiás la regla, actualizá ambos lados.
export function computeIsMusicFlag(category, musicVideoType, artist) {
  return (
    category === "Music" ||
    Boolean(musicVideoType) ||
    isTopicChannelName(artist)
  );
}

// Punto de verdad único: música = plataforma YT Music o flag de contenido.
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

export function formatShortDateTime(ts) {
  const d = new Date(ts);
  const dateStr = d.toLocaleDateString([], {
    day: "2-digit",
    month: "2-digit",
  });
  const timeStr = d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dateStr} ${timeStr}`;
}

export function computeStreak(items) {
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
  // FASE 2: "YT Music" = contenido musical (cualquier plataforma);
  // "YouTube" = plataforma YouTube sin contenido musical.
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

export function aggregateTracks(items) {
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

export function sanitizeFileSlug(text) {
  return (
    String(text || "imagen")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
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
