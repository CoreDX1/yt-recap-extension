// src/rows.js
import { translateCategory, formatShortDateTime } from "./utils.js";

export function buildTrackRow(
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

  let img = null;
  if (!opts.noThumb) {
    img = document.createElement("img");
    img.className = opts.avatar ? "thumb avatar" : "thumb";
    if (artwork) img.src = artwork;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
  }

  const meta = document.createElement("div");
  meta.className = "meta";

  const title = document.createElement("div");
  title.className = "track-title";
  title.textContent = titleText;

  const sub = document.createElement("div");
  sub.className = "track-sub";
  sub.textContent = subText;

  meta.append(title, sub);

  if (opts.barPct > 0) {
    const track = document.createElement("div");
    track.className = "ch-bar-track";
    const fill = document.createElement("div");
    fill.className = "ch-bar-fill";
    fill.style.width = `${Math.min(100, Math.max(3, opts.barPct))}%`;
    track.append(fill);
    meta.append(track);
  }

  const stats = document.createElement("div");
  stats.className = "track-stats";
  stats.textContent = rightText;

  const children = img ? [rank, img, meta, stats] : [rank, meta, stats];

  if (opts.href) {
    const a = document.createElement("a");
    a.className = "item-link";
    a.href = opts.href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.append(...children);
    li.append(a);
  } else {
    li.append(...children);
  }
  return li;
}

export function renderInteractionRow(it) {
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

export function renderSearchRow(s) {
  const src = s.source === "yt_music" ? "YT Music" : "YouTube";
  return buildTrackRow(
    "🔍",
    "",
    s.query,
    `${src} · ${formatShortDateTime(s.timestamp)}`,
    "Buscar ↗",
    { href: s.url || undefined, noThumb: true },
  );
}
