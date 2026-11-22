// src/relativeTime.js

const TIME_FMT = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const DAY_FMT = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
});
const FULL_FMT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatTimeEs(ts) {
  return TIME_FMT.format(new Date(ts));
}

export function formatFullEs(ts) {
  return FULL_FMT.format(new Date(ts));
}

export function relativeTime(ts) {
  const now = Date.now();
  const diff = Math.max(0, now - ts);
  if (diff < 60000) return "ahora";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `hace ${mins} min`;
  const d = new Date(ts);
  const today = new Date(now);
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) return `hace ${Math.floor(mins / 60)} h`;
  const yest = new Date(now - 86400000);
  const isYesterday =
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate();
  if (isYesterday) return `ayer ${TIME_FMT.format(d)}`;
  return `${DAY_FMT.format(d)} ${TIME_FMT.format(d)}`;
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "Buenas noches";
  if (h < 13) return "Buenos días";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}
