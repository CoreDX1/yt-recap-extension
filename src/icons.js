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
  close: P("M6 6l12 12") + P("M18 6L6 18"),
  search:
    P("M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z") + P("M15.5 15.5L20 20"),
  home: P("M4 11l8-7 8 7") + P("M6 9.5V20h12V9.5"),
  explore: P("M12 3l9 18H3z") + P("M12 10v5"),
  calendar: P("M4 6h16v14H4z") + P("M4 10h16") + P("M8 3v5") + P("M16 3v5"),
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
};

export function icon(name, size = 20, cls = "") {
  const body = PATHS[name] || PATHS.spark;
  return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

export function mountIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    const name = el.dataset.icon;
    const size = Number(el.dataset.size || 20);
    el.innerHTML = icon(name, size);
  });
}
