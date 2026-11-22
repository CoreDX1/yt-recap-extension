// src/icons.js
const P = (d, extra = "") => `<path d="${d}" ${extra} />`;
const PATHS = {
  play: P("M8 5.4v13.2L19 12z", 'fill="currentColor" stroke="none"'),
  pause:
    P("M8 5.5h3v13H8z", 'fill="currentColor" stroke="none"') +
    P("M13 5.5h3v13h-3z", 'fill="currentColor" stroke="none"'),
  prev:
    P("M18 6v12L9.5 12z", 'fill="currentColor" stroke="none"') +
    P("M6 6h2v12H6z", 'fill="currentColor" stroke="none"'),
  next:
    P("M6 6v12l8.5-6z", 'fill="currentColor" stroke="none"') +
    P("M16 6h2v12h-2z", 'fill="currentColor" stroke="none"'),
  volume:
    P("M4 9.5v5h3.5L12 18V6L7.5 9.5z") +
    P("M15.5 9.2a4 4 0 0 1 0 5.6") +
    P("M18 6.8a7.4 7.4 0 0 1 0 10.4"),
  mute:
    P("M4 9.5v5h3.5L12 18V6L7.5 9.5z") + P("M16 9.5l5 5") + P("M21 9.5l-5 5"),
  loop:
    P("M4 9a4 4 0 0 1 4-4h9") +
    P("M14 2.5L17.5 5L14 7.5") +
    P("M20 15a4 4 0 0 1-4 4H7") +
    P("M10 21.5L6.5 19L10 16.5"),
  shuffle:
    P("M3 6.5h3.2c1.6 0 3 .8 3.9 2.1l4 5.8c.9 1.3 2.3 2.1 3.9 2.1H21") +
    P("M18 13.5l3 3-3 3") +
    P("M3 17.5h3.2c1.6 0 3-.8 3.9-2.1l.9-1.3") +
    P("M13.2 9.4l.8-1.1c.9-1.3 2.3-2.1 3.9-2.1H21") +
    P("M18 3.5l3 3-3 3"),
  queue:
    P("M4 6h16") +
    P("M4 12h10") +
    P("M4 18h7") +
    P("M17 12.5v6l5-3z", 'fill="currentColor" stroke="none"'),
  jump:
    P("M14 4h6v6") +
    P("M20 4l-9 9") +
    P("M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"),
  mini:
    P("M3 5.5h18v13H3z") +
    P("M12 11h6v5h-6z", 'fill="currentColor" stroke="none"'),
  panelRight: P("M3 5h18v14H3z") + P("M15 5v14") + P("M17 8h2") + P("M17 12h2"),
  library:
    P("M4 4h2.5v16H4z", 'fill="currentColor" stroke="none"') +
    P("M9 4h2.5v16H9z", 'fill="currentColor" stroke="none"') +
    P("M13.5 4.6l2.4-.6 4 15.4-2.4.6z", 'fill="currentColor" stroke="none"'),
  close: P("M6 6l12 12") + P("M18 6L6 18"),
  search:
    P("M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z") + P("M15.5 15.5L20 20"),
  home: P("M4 11l8-7 8 7") + P("M6 9.5V20h12V9.5"),
  explore:
    P("M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z") +
    P("M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z"),
  calendar: P("M4 6h16v14H4z") + P("M4 10h16") + P("M8 3v5") + P("M16 3v5"),
  calendarCheck:
    P("M4 6h16v14H4z") +
    P("M4 10h16") +
    P("M8 3v5") +
    P("M16 3v5") +
    P("M8.5 14.5l2.5 2.5 4.5-4.5"),
  people:
    P("M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8z") + P("M4.5 20a7.5 7.5 0 0 1 15 0"),
  heart: P(
    "M12 20s-7.5-4.6-9.3-9A5.2 5.2 0 0 1 12 6.6 5.2 5.2 0 0 1 21.3 11c-1.8 4.4-9.3 9-9.3 9z",
  ),
  heartFill: P(
    "M12 20s-7.5-4.6-9.3-9A5.2 5.2 0 0 1 12 6.6 5.2 5.2 0 0 1 21.3 11c-1.8 4.4-9.3 9-9.3 9z",
    'fill="currentColor" stroke="none"',
  ),
  plus: P("M12 5v14") + P("M5 12h14"),
  chevronLeft: P("M14.5 5.5L8 12l6.5 6.5"),
  chevronRight: P("M9.5 5.5L16 12l-6.5 6.5"),
  arrowLeft: P("M20 12H4") + P("M10 6l-6 6 6 6"),
  help:
    P("M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z") +
    P("M9.6 9.2a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.2 1-1.2 1.9") +
    P("M12 17h.01"),
  drag:
    P("M9 6h.01") +
    P("M15 6h.01") +
    P("M9 12h.01") +
    P("M15 12h.01") +
    P("M9 18h.01") +
    P("M15 18h.01"),
  clock: P("M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z") + P("M12 7v5l3.5 2"),
  check: P("M4.5 12.5l5 5L19.5 7"),
  alert: P("M12 3l10 18H2z") + P("M12 10v5") + P("M12 18h.01"),
  pin: P("M12 3l5 5-2 1-1 5-2-2-4 4-1-1 4-4-2-2 5-1z"),
  music:
    P("M9 18V5l11-2v13") +
    P("M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z") +
    P("M20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"),
  youtube:
    P(
      "M2.5 8.5a3 3 0 0 1 3-3h13a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3z",
    ) + P("M10 9.2v5.6l5-2.8z", 'fill="currentColor" stroke="none"'),
  chart: P("M4 20V10") + P("M10 20V4") + P("M16 20v-8") + P("M22 20H2"),
  eye:
    P("M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z") +
    P("M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"),
  bell: P("M6 16v-5a6 6 0 1 1 12 0v5l2 3H4z") + P("M10 21a2 2 0 0 0 4 0"),
  trash: P("M4 7h16") + P("M9 7V4h6v3") + P("M6 7l1 13h10l1-13"),
  refresh: P("M20 12a8 8 0 1 1-2.3-5.6") + P("M20 4v5h-5"),
  swap: P("M7 8h11") + P("M15 5l3 3-3 3") + P("M17 16H6") + P("M9 13l-3 3 3 3"),
  import: P("M12 4v11") + P("M8 11l4 4 4-4") + P("M4 19h16"),
  export: P("M12 15V4") + P("M8 8l4-4 4 4") + P("M4 19h16"),
  spark: P("M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"),
  playCircle:
    P("M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z") +
    P("M10 8.5l6 3.5-6 3.5z", 'fill="currentColor" stroke="none"'),
  hash: P("M9 4L7 20") + P("M17 4l-2 16") + P("M4 9h16") + P("M3 15h16"),
  flame:
    P("M12 3s5 4.2 5 9a5 5 0 0 1-10 0c0-1.6.6-3 1.5-4.2C9.4 9.9 12 8 12 3z") +
    P(
      "M12 20a2.6 2.6 0 0 0 2.6-2.6c0-1.6-2.6-3.4-2.6-3.4s-2.6 1.8-2.6 3.4A2.6 2.6 0 0 0 12 20z",
    ),
  peak: P("M3 17l5-7 4 4 5-8") + P("M17 6h4v4"),
  disc:
    P("M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z") +
    P("M12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"),
  video: P("M3 6.5h12v11H3z") + P("M15 10l6-3.5v11L15 14z"),
  bolt: P("M13 2L4 14h6l-1 8 9-12h-6z"),
  broadcast:
    P("M12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4z") +
    P("M7.8 7.8a6 6 0 0 0 0 8.4") +
    P("M16.2 16.2a6 6 0 0 0 0-8.4") +
    P("M4.9 4.9a10 10 0 0 0 0 14.2") +
    P("M19.1 19.1a10 10 0 0 0 0-14.2"),
  trophy:
    P("M7 4h10v5a5 5 0 0 1-10 0z") +
    P("M7 5H4v2a3 3 0 0 0 3 3") +
    P("M17 5h3v2a3 3 0 0 1-3 3") +
    P("M10 14h4l1 6H9z"),
  filter: P("M3 5h18l-7 8v6l-4 2v-8z"),
  grid:
    P("M4 4h7v7H4z") +
    P("M13 4h7v7h-7z") +
    P("M4 13h7v7H4z") +
    P("M13 13h7v7h-7z"),
  list: P("M4 6h16") + P("M4 12h16") + P("M4 18h16"),
  mic:
    P("M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z") +
    P("M5 11a7 7 0 0 0 14 0") +
    P("M12 18v3"),
  area:
    P("M3 17l5-6 4 3 5-7 4 4v6H3z", 'fill="currentColor" stroke="none"') +
    P("M3 17l5-6 4 3 5-7 4 4"),
  compare: P("M4 5h9v9H4z") + P("M11 10h9v9h-9z"),
  bulb:
    P("M9 18h6") +
    P("M10 21h4") +
    P(
      "M12 3a6 6 0 0 1 3.6 10.8c-.6.5-.6 1.2-.6 2.2H9c0-1 0-1.7-.6-2.2A6 6 0 0 1 12 3z",
    ),
  info:
    P("M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z") + P("M12 11v5") + P("M12 8h.01"),
  moon: P("M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"),
  target:
    P("M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z") +
    P("M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z") +
    P("M12 11.5a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1z"),
};
export function icon(name, size = 20, cls = "") {
  const body = PATHS[name] || PATHS.spark;
  return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}
export function mountIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size || 20));
  });
}
