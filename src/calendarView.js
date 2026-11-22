// src/calendarView.js — calendario v3 (escala relativa, celdas densas,
// marcas con forma, iconos SVG, horas 24h es-AR, semanas compactas,
// rango con shift+clic, año con etiquetas y zoom).
import {
  translateCategory,
  toDateKey,
  resolveVideoUrl,
  openInstantPlaylist,
  formatClock,
  formatDuration,
  aggregateTracks,
  isMusicItem,
} from "./utils.js";
import { icon } from "./icons.js";
import { formatTimeEs } from "./relativeTime.js";

const WD_SHORT = ["L", "M", "X", "J", "V", "S", "D"];
const WD_FULL = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
const F_MONTH = new Intl.DateTimeFormat("es-AR", { month: "long" });
const F_MONTH_SHORT = new Intl.DateTimeFormat("es-AR", { month: "short" });
const F_MONTH_YEAR = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  year: "numeric",
});
const F_DAY_FULL = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const F_DAY_SHORT = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "numeric",
});
const RANK_ICONS = {
  "❤️": "heartFill",
  "❤": "heartFill",
  "🔔": "bell",
  "🔍": "search",
  "🔁": "loop",
  "👁": "eye",
  "👁️": "eye",
};
const ABS_HINT = "Umbrales fijos: <15m · 15–45m · 45m–2h · >2h";

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function ico(name, size = 13, cls = "cal-ico") {
  const s = el("span", cls);
  s.innerHTML = icon(name, size);
  return s;
}
function rich(node, parts) {
  node.replaceChildren();
  for (const p of parts) {
    if (p == null || p === false || p === "") continue;
    if (typeof p === "string" || typeof p === "number") node.append(String(p));
    else node.append(ico(p.i, p.s || 13));
  }
}
function paintPillIcons() {
  document.querySelectorAll("[data-pillico]").forEach((s) => {
    s.innerHTML = icon(s.dataset.pillico, Number(s.dataset.size || 12));
  });
}
function cleanRank(li) {
  const r = li.querySelector(".rank");
  if (!r) return li;
  const name = RANK_ICONS[r.textContent.trim()];
  if (!name) return li;
  r.replaceChildren(ico(name, 12, "rank-ico"));
  r.style.display = "flex";
  r.style.alignItems = "center";
  r.style.justifyContent = "center";
  return li;
}
function absLevel(sec) {
  return sec >= 7200 ? 4 : sec >= 2700 ? 3 : sec >= 900 ? 2 : 1;
}
function relLevel(sec, max) {
  if (sec <= 0 || max <= 0) return 1;
  return Math.max(1, Math.min(4, Math.ceil((sec / max) * 4)));
}
function getScale(ui) {
  if (ui.calScale !== "relative" && ui.calScale !== "absolute") {
    ui.calScale =
      localStorage.getItem("recapCalScale") === "absolute"
        ? "absolute"
        : "relative";
  }
  return ui.calScale;
}
function getZoom(ui) {
  const z = Number(
    ui.calYrZoom || localStorage.getItem("recapCalYrZoom") || 12,
  );
  ui.calYrZoom = [10, 12, 14].includes(z) ? z : 12;
  return ui.calYrZoom;
}
function getMondayWeeksOfMonth(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = [];
  let start = 1,
    num = 1;
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(year, month, day).getDay();
    if (dow === 0 || day === daysInMonth) {
      weeks.push({ num: num++, start, end: day });
      start = day + 1;
    }
  }
  return weeks;
}
function getMonthMetrics(plays, inter, searches) {
  const daysMap = new Map();
  let totalSec = 0;
  for (const p of plays) {
    totalSec += p.seconds || 0;
    const k = toDateKey(new Date(p.timestamp));
    daysMap.set(k, (daysMap.get(k) || 0) + (p.seconds || 0));
  }
  for (const it of inter) {
    const k = toDateKey(new Date(it.timestamp));
    if (!daysMap.has(k)) daysMap.set(k, 0);
  }
  for (const s of searches) {
    const k = toDateKey(new Date(s.timestamp));
    if (!daysMap.has(k)) daysMap.set(k, 0);
  }
  return { totalSec, activeDays: daysMap.size, daysMap };
}
function doesEntryMatchQuery(entry, kind, query) {
  if (!query) return true;
  if (kind === "play" || kind === "inter") {
    return (
      (entry.title || "").toLowerCase().includes(query) ||
      (entry.artist || "").toLowerCase().includes(query)
    );
  }
  return (entry.query || "").toLowerCase().includes(query);
}
function rangeKeys(a, b) {
  if (!a || !b) return null;
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const out = [];
  const cur = new Date(`${lo}T00:00:00`);
  const end = new Date(`${hi}T00:00:00`);
  let guard = 0;
  while (cur <= end && guard < 800) {
    out.push(toDateKey(cur));
    cur.setDate(cur.getDate() + 1);
    guard += 1;
  }
  return { lo, hi, keys: out };
}

export function renderCalendarView({
  dom,
  uiState,
  getFilteredPlays,
  getFilteredMeta,
  store,
  buildTrackRow,
  renderInteractionRow,
  renderSearchRow,
  onExportPng,
  variant = "compact",
}) {
  const isFull = variant === "full";
  const scale = getScale(uiState);
  const rerender = () =>
    renderCalendarView({
      dom,
      uiState,
      getFilteredPlays,
      getFilteredMeta,
      store,
      buildTrackRow,
      renderInteractionRow,
      renderSearchRow,
      onExportPng,
      variant,
    });

  const sourcePlays = getFilteredPlays(false);
  const sourceInteractions = getFilteredMeta(store.interactions, false);
  const sourceSearches = getFilteredMeta(store.searches, false);

  const playsByDate = new Map();
  const interByDate = new Map();
  const searchesByDate = new Map();
  const push = (map, k, item) => {
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  };
  for (const item of sourcePlays)
    push(playsByDate, toDateKey(new Date(item.timestamp)), item);
  for (const it of sourceInteractions)
    push(interByDate, toDateKey(new Date(it.timestamp)), it);
  for (const s of sourceSearches)
    push(searchesByDate, toDateKey(new Date(s.timestamp)), s);

  const query = (uiState.calSearchQuery || "").trim().toLowerCase();
  const levelFilter = uiState.calLevelFilter ?? null;
  const range = rangeKeys(uiState.calRangeAnchor, uiState.calRangeEnd);

  paintPillIcons();
  if (dom.calLegendCrown) dom.calLegendCrown.innerHTML = icon("trophy", 11);
  const rangeIco = document.querySelector("#calRangeSummary .cal-range-ico");
  if (rangeIco) rangeIco.innerHTML = icon("calendarCheck", 14);

  // --- elementos exclusivos del modo completo ---
  if (dom.calLegendPro) dom.calLegendPro.hidden = !isFull;
  if (dom.calMonthMeta) dom.calMonthMeta.hidden = !isFull;
  if (dom.calDayHead) dom.calDayHead.hidden = !isFull;
  if (dom.calRecordCard) dom.calRecordCard.hidden = !isFull;
  if (dom.calYearZoom) dom.calYearZoom.hidden = !isFull;
  if (dom.calYearMonths) dom.calYearMonths.hidden = !isFull;
  if (dom.calYearDays) dom.calYearDays.hidden = !isFull;

  // --- resumen de búsqueda ---
  if (query) {
    const matchedPlays = sourcePlays.filter((p) =>
      doesEntryMatchQuery(p, "play", query),
    );
    const matchedDays = new Set(
      matchedPlays.map((p) => toDateKey(new Date(p.timestamp))),
    );
    const matchedSec = matchedPlays.reduce(
      (acc, p) => acc + (p.seconds || 0),
      0,
    );
    dom.calSearchSummary.hidden = false;
    rich(dom.calSearchSummary, [
      { i: "search", s: 13 },
      ` «${uiState.calSearchQuery.trim()}»: ${matchedDays.size} días · ${matchedPlays.length} rep. · ${formatDuration(matchedSec)}`,
    ]);
  } else {
    dom.calSearchSummary.hidden = true;
  }

  // --- resumen de rango (shift+clic) ---
  if (dom.calRangeSummary) {
    if (range && isFull) {
      let rSec = 0,
        rPlays = 0,
        rLikes = 0,
        rSubs = 0,
        rSearch = 0,
        rDays = 0;
      for (const k of range.keys) {
        const dp = playsByDate.get(k) || [];
        const di = interByDate.get(k) || [];
        const ds = searchesByDate.get(k) || [];
        if (dp.length || di.length || ds.length) rDays += 1;
        rPlays += dp.length;
        rSec += dp.reduce((a, p) => a + (p.seconds || 0), 0);
        rLikes += di.filter((x) => x.type === "like").length;
        rSubs += di.filter((x) => x.type === "subscribe").length;
        rSearch += ds.length;
      }
      const fmt = (k) => F_DAY_SHORT.format(new Date(`${k}T00:00:00`));
      dom.calRangeSummary.hidden = false;
      if (dom.calRangeText) {
        dom.calRangeText.textContent =
          `${fmt(range.lo)} → ${fmt(range.hi)} · ${range.keys.length} días (${rDays} con actividad) · ` +
          `${formatDuration(rSec)} · ${rPlays} rep · ${rLikes} likes · ${rSubs} subs · ${rSearch} búsquedas`;
      }
    } else {
      dom.calRangeSummary.hidden = true;
    }
  }

  const isYearMode = uiState.calViewMode === "year";
  dom.calMonthView.hidden = isYearMode;
  dom.calYearView.hidden = !isYearMode;

  if (isYearMode) {
    renderAnnualView({
      dom,
      uiState,
      playsByDate,
      interByDate,
      searchesByDate,
      query,
      scale,
      levelFilter,
      isFull,
      rerender,
    });
    return;
  }

  // ================= VISTA MENSUAL =================
  const year = uiState.calYear;
  const month = uiState.calMonth;
  const monthDate = new Date(year, month, 1);
  const rawMonthWord = F_MONTH.format(monthDate);
  const shortMonth = F_MONTH_SHORT.format(monthDate).replace(".", "");
  dom.calMonthLabel.textContent = F_MONTH_YEAR.format(monthDate);
  dom.calWeeksTitle.textContent = `Top por semana de ${rawMonthWord}`;

  const inMonth = (y, m) => (item) => {
    const d = new Date(item.timestamp);
    return d.getFullYear() === y && d.getMonth() === m;
  };
  const monthPlays = sourcePlays.filter(inMonth(year, month));
  const monthInter = sourceInteractions
    .filter(inMonth(year, month))
    .sort((a, b) => b.timestamp - a.timestamp);
  const monthSearches = sourceSearches.filter(inMonth(year, month));
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const {
    totalSec: monthTotalSec,
    activeDays,
    daysMap: monthDaysMap,
  } = getMonthMetrics(monthPlays, monthInter, monthSearches);

  let monthMaxSec = 0;
  let recordKey = null;
  for (const [k, s] of monthDaysMap) {
    if (s > monthMaxSec) {
      monthMaxSec = s;
      recordKey = k;
    }
  }
  const levelOf = (sec, hasAny) => {
    if (!hasAny) return 0;
    return scale === "relative" ? relLevel(sec, monthMaxSec) : absLevel(sec);
  };

  // --- leyenda pro ---
  if (dom.calLegendPro && isFull) {
    dom.calScaleToggle?.querySelectorAll("[data-calscale]").forEach((b) => {
      const on = b.dataset.calscale === scale;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    const absTitles = [
      "Menos de 15 min",
      "15 a 45 min",
      "45 min a 2 h",
      "Más de 2 h",
    ];
    dom.calLegendPro.querySelectorAll("[data-callevel]").forEach((b) => {
      const n = Number(b.dataset.callevel);
      const on = levelFilter === n;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
      let title;
      if (scale === "relative") {
        const lo = Math.round((monthMaxSec * (n - 1)) / 4);
        const hi = Math.round((monthMaxSec * n) / 4);
        title =
          monthMaxSec > 0
            ? `Nivel ${n}: ${formatDuration(lo)} – ${formatDuration(hi)} (relativo al máximo del mes)`
            : `Nivel ${n}`;
      } else title = absTitles[n - 1];
      b.title = title;
      b.setAttribute("aria-label", `Filtrar por ${title}`);
    });
    if (dom.calLevelClear) dom.calLevelClear.hidden = levelFilter == null;
    if (dom.calLegendHint) {
      dom.calLegendHint.textContent =
        scale === "relative"
          ? monthMaxSec > 0
            ? `Escala relativa al día más fuerte (${formatDuration(monthMaxSec)})`
            : "Escala relativa · sin reproducciones este mes"
          : ABS_HINT;
    }
  }

  // --- rachas ---
  const streakDaysSet = new Set();
  let maxMonthStreak = 0;
  let run = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const k = toDateKey(new Date(year, month, d));
    const active =
      (playsByDate.get(k)?.length || 0) > 0 ||
      (interByDate.get(k)?.length || 0) > 0;
    if (active) run.push(k);
    else {
      if (run.length >= 2) run.forEach((rk) => streakDaysSet.add(rk));
      if (run.length > maxMonthStreak) maxMonthStreak = run.length;
      run = [];
    }
  }
  if (run.length >= 2) run.forEach((rk) => streakDaysSet.add(rk));
  if (run.length > maxMonthStreak) maxMonthStreak = run.length;

  // --- celdas ---
  const firstMondayIdx = (monthDate.getDay() + 6) % 7;
  const prevMonthDays = new Date(year, month, 0).getDate();
  const todayKey = toDateKey(new Date());
  const cellDefs = [];
  for (let i = firstMondayIdx - 1; i >= 0; i--) {
    cellDefs.push({
      date: new Date(year, month - 1, prevMonthDays - i),
      otherMonth: true,
    });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cellDefs.push({ date: new Date(year, month, day), otherMonth: false });
  }
  const rem = (7 - (cellDefs.length % 7)) % 7;
  for (let i = 1; i <= rem; i++) {
    cellDefs.push({ date: new Date(year, month + 1, i), otherMonth: true });
  }

  const selectedKey = uiState.selectedDateKey;
  const focusKey = cellDefs.some((c) => toDateKey(c.date) === selectedKey)
    ? selectedKey
    : cellDefs.find((c) => !c.otherMonth && toDateKey(c.date) === todayKey)
      ? todayKey
      : toDateKey(cellDefs.find((c) => !c.otherMonth).date);

  const buildCell = ({ date, otherMonth }) => {
    const key = toDateKey(date);
    const dp = playsByDate.get(key) || [];
    const di = interByDate.get(key) || [];
    const ds = searchesByDate.get(key) || [];
    const daySec = dp.reduce((acc, p) => acc + (p.seconds || 0), 0);
    const hasAny = dp.length > 0 || di.length > 0 || ds.length > 0;
    const lk = di.filter((x) => x.type === "like").length;
    const sb = di.filter((x) => x.type === "subscribe").length;
    const level = otherMonth ? 0 : levelOf(daySec, hasAny);
    const isRecord = !otherMonth && key === recordKey && monthMaxSec > 0;

    const btn = el("button", "cal-day");
    btn.type = "button";
    btn.dataset.key = key;
    btn.dataset.other = otherMonth ? "1" : "0";
    btn.dataset.level = String(level);
    btn.dataset.sec = String(daySec);
    btn.setAttribute("role", "gridcell");
    btn.setAttribute("aria-selected", String(key === selectedKey));
    btn.tabIndex = key === focusKey ? 0 : -1;

    const top = el("span", "cal-top");
    top.append(el("span", "cal-num", String(date.getDate())));
    if (isFull && isRecord) {
      const crown = ico("trophy", 12, "cal-crown");
      crown.style.color = level >= 3 ? "var(--heat-ink)" : "var(--cal-streak)";
      top.append(crown);
    }
    btn.append(top);
    if (isFull && daySec > 0)
      btn.append(el("span", "cal-dur", formatDuration(daySec)));

    if (otherMonth) btn.classList.add("other-month");
    if (key === todayKey) btn.classList.add("today");
    if (!otherMonth && streakDaysSet.has(key)) btn.classList.add("in-streak");
    if (level > 0) btn.classList.add(`heat-${level}`);
    if (isRecord) btn.classList.add("is-record");
    if (key === selectedKey) btn.classList.add("selected");
    if (range && key >= range.lo && key <= range.hi)
      btn.classList.add("in-range");

    if (hasAny && (lk > 0 || sb > 0 || ds.length > 0)) {
      const dots = el("span", "cal-dots");
      if (lk > 0) dots.append(el("span", "cal-dot like"));
      if (sb > 0) dots.append(el("span", "cal-dot sub"));
      if (ds.length > 0) dots.append(el("span", "cal-dot search"));
      btn.append(dots);
    }

    const labelParts = [F_DAY_FULL.format(date)];
    if (hasAny) {
      if (dp.length)
        labelParts.push(`${formatDuration(daySec)} (${dp.length} rep.)`);
      if (lk) labelParts.push(`${lk} likes`);
      if (sb) labelParts.push(`${sb} suscripciones`);
      if (ds.length) labelParts.push(`${ds.length} búsquedas`);
      if (isRecord) labelParts.push("día récord del mes");
    } else labelParts.push("sin actividad");
    const label = labelParts.join(" · ");
    btn.title = label;
    btn.setAttribute("aria-label", label);

    let dim = false;
    if (query) {
      const dayMatches =
        dp.some((p) => doesEntryMatchQuery(p, "play", query)) ||
        di.some((it) => doesEntryMatchQuery(it, "inter", query)) ||
        ds.some((s) => doesEntryMatchQuery(s, "search", query));
      if (dayMatches) btn.classList.add("match-filter");
      else if (hasAny) dim = true;
    }
    if (levelFilter != null && !otherMonth && level !== levelFilter) dim = true;
    if (dim) btn.classList.add("dimmed");

    btn.addEventListener("click", (e) => {
      if (e.shiftKey && uiState.selectedDateKey) {
        uiState.calRangeAnchor = uiState.selectedDateKey;
        uiState.calRangeEnd = key;
      } else {
        uiState.calRangeAnchor = null;
        uiState.calRangeEnd = null;
      }
      uiState.selectedDateKey = key;
      if (otherMonth) {
        uiState.calYear = date.getFullYear();
        uiState.calMonth = date.getMonth();
      }
      rerender();
    });
    return btn;
  };

  const rows = [];
  for (let i = 0; i < cellDefs.length; i += 7) {
    const row = el("div", "cal-week-row");
    row.setAttribute("role", "row");
    row.style.display = "contents";
    row.append(...cellDefs.slice(i, i + 7).map(buildCell));
    rows.push(row);
  }
  dom.calGrid.setAttribute("role", "grid");
  dom.calGrid.setAttribute("aria-label", `Días de ${rawMonthWord} de ${year}`);
  dom.calGrid.replaceChildren(...rows);

  // --- línea de resumen del mes ---
  if (dom.calMonthMeta && isFull) {
    const recLabel = recordKey
      ? F_DAY_SHORT.format(new Date(`${recordKey}T00:00:00`))
      : null;
    rich(dom.calMonthMeta, [
      { i: "clock", s: 13 },
      ` ${formatDuration(monthTotalSec)}`,
      { i: "playCircle", s: 13 },
      ` ${monthPlays.length} rep`,
      { i: "calendarCheck", s: 13 },
      ` ${activeDays}/${daysInMonth} días`,
      recLabel ? { i: "trophy", s: 13 } : null,
      recLabel ? ` récord ${recLabel}` : null,
      { i: "flame", s: 13 },
      ` racha ${maxMonthStreak}`,
    ]);
  }

  // ================= DETALLE DEL DÍA =================
  const [sy, sm, sd] = uiState.selectedDateKey.split("-").map(Number);
  const selDate = new Date(sy, sm - 1, sd);
  const formattedDay = F_DAY_FULL.format(selDate);
  const dayPlays = playsByDate.get(uiState.selectedDateKey) || [];
  const dayInter = interByDate.get(uiState.selectedDateKey) || [];
  const dayLikes = dayInter.filter((x) => x.type === "like");
  const daySubs = dayInter.filter((x) => x.type === "subscribe");
  const daySearches = searchesByDate.get(uiState.selectedDateKey) || [];
  const dayTotalSec = dayPlays.reduce((acc, it) => acc + (it.seconds || 0), 0);

  if (dom.calDayHead && isFull) {
    const block = el("div", "cal-date-block");
    block.append(el("strong", "cal-date-num", String(sd)));
    block.append(
      el(
        "span",
        "cal-date-mon",
        F_MONTH_SHORT.format(selDate).replace(".", ""),
      ),
    );
    const info = el("div", "cal-date-info");
    info.append(
      el(
        "div",
        "cal-date-wd",
        new Intl.DateTimeFormat("es-AR", { weekday: "long" }).format(selDate),
      ),
    );
    const chips = el("div", "cal-date-chips");
    const chip = (iconName, text, cls = "") => {
      const c = el("span", `cal-date-chip${cls ? ` ${cls}` : ""}`);
      c.append(ico(iconName, 12), el("span", null, text));
      return c;
    };
    chips.append(
      chip("clock", formatDuration(dayTotalSec), dayTotalSec > 0 ? "on" : ""),
    );
    chips.append(chip("playCircle", `${dayPlays.length} rep`));
    if (dayLikes.length)
      chips.append(chip("heartFill", String(dayLikes.length), "like"));
    if (daySubs.length)
      chips.append(chip("bell", String(daySubs.length), "sub"));
    if (daySearches.length)
      chips.append(chip("search", String(daySearches.length), "search"));
    info.append(chips);
    dom.calDayHead.replaceChildren(block, info);
  }

  const dayMeta = [];
  if (dayPlays.length)
    dayMeta.push(`${formatDuration(dayTotalSec)} (${dayPlays.length}x)`);
  if (dayLikes.length) dayMeta.push(`${dayLikes.length} likes`);
  if (daySubs.length) dayMeta.push(`${daySubs.length} subs`);
  if (daySearches.length) dayMeta.push(`${daySearches.length} búsquedas`);
  dom.calDayTitle.textContent = dayMeta.length
    ? `${formattedDay} · ${dayMeta.join(" · ")}`
    : formattedDay;

  if (dayPlays.length > 0) {
    const sortedAsc = [...dayPlays].sort((a, b) => a.timestamp - b.timestamp);
    const firstTs = sortedAsc[0].timestamp;
    const lastItem = sortedAsc[sortedAsc.length - 1];
    const lastTs = lastItem.timestamp + (lastItem.seconds || 0) * 1000;
    const dayCh = new Map();
    const dayCat = new Map();
    for (const p of dayPlays) {
      dayCh.set(
        p.artist || "YouTube",
        (dayCh.get(p.artist || "YouTube") || 0) + (p.seconds || 1),
      );
      const c = p.category || (isMusicItem(p) ? "Music" : "");
      if (c) dayCat.set(c, (dayCat.get(c) || 0) + (p.seconds || 1));
    }
    const topDayCh = [...dayCh.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const topDayCat = [...dayCat.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    rich(dom.calDaySummary, [
      { i: "clock", s: 12 },
      ` ${formatTimeEs(firstTs)} – ${formatTimeEs(lastTs)}`,
      topDayCh ? { i: "mic", s: 12 } : null,
      topDayCh ? ` ${topDayCh}` : null,
      topDayCat ? { i: "disc", s: 12 } : null,
      topDayCat ? ` ${translateCategory(topDayCat)}` : null,
    ]);
    dom.calDaySummary.hidden = false;
  } else {
    dom.calDaySummary.hidden = true;
  }

  const combined = [];
  const mode = uiState.calDayMode;
  if (mode === "all" || mode === "plays") {
    dayPlays.forEach((d) => {
      if (!query || doesEntryMatchQuery(d, "play", query))
        combined.push({ kind: "play", ts: d.timestamp, d });
    });
  }
  if (mode === "all" || mode === "likes") {
    dayLikes.forEach((d) => {
      if (!query || doesEntryMatchQuery(d, "inter", query))
        combined.push({ kind: "like", ts: d.timestamp, d });
    });
  }
  if (mode === "all" || mode === "subs") {
    daySubs.forEach((d) => {
      if (!query || doesEntryMatchQuery(d, "inter", query))
        combined.push({ kind: "sub", ts: d.timestamp, d });
    });
  }
  if (mode === "all" || mode === "searches") {
    daySearches.forEach((d) => {
      if (!query || doesEntryMatchQuery(d, "search", query))
        combined.push({ kind: "search", ts: d.timestamp, d });
    });
  }
  combined.sort((a, b) => b.ts - a.ts);
  dom.calDayEmpty.hidden = combined.length > 0;
  dom.calDayList.replaceChildren(
    ...combined.map(({ kind, ts, d }) => {
      const timeStr = formatTimeEs(ts);
      if (kind === "play") {
        const sub = `${d.artist} · ${timeStr}${d.isLoop ? " · ↻ bucle" : ""}`;
        return cleanRank(
          buildTrackRow(
            d.isLoop ? "↻" : "·",
            d.artwork,
            d.title,
            sub,
            d.seconds > 0 ? formatClock(d.seconds) : "Takeout",
            { href: resolveVideoUrl(d) || undefined },
          ),
        );
      }
      if (kind === "like" || kind === "sub")
        return cleanRank(renderInteractionRow(d));
      return cleanRank(renderSearchRow(d));
    }),
  );
  if (isFull) dom.calDayList.scrollTop = 0;

  // ================= MÉTRICAS DEL MES =================
  const prevY = month === 0 ? year - 1 : year;
  const prevM = month === 0 ? 11 : month - 1;
  const prevPlays = sourcePlays.filter(inMonth(prevY, prevM));
  const prevWord = F_MONTH_SHORT.format(new Date(prevY, prevM, 1)).replace(
    ".",
    "",
  );
  const prevTotalSec = prevPlays.reduce((acc, p) => acc + (p.seconds || 0), 0);

  if (monthPlays.length === 0 && monthInter.length === 0) {
    dom.calMonthStatsBox.hidden = true;
  } else {
    dom.calMonthStatsBox.hidden = false;
    const avgSec = activeDays > 0 ? Math.round(monthTotalSec / activeDays) : 0;
    const stats = [
      ["calendarCheck", "Días activos", `${activeDays}/${daysInMonth}`],
      ["clock", "Promedio/día", formatDuration(avgSec)],
      [
        "flame",
        "Racha máx.",
        `${maxMonthStreak} ${maxMonthStreak === 1 ? "día" : "días"}`,
      ],
    ];
    dom.calMonthStatsGrid.replaceChildren(
      ...stats.map(([iconName, lbl, val]) => {
        const card = el("div", "stat-card");
        const sp = el("span", "stat-label");
        sp.append(ico(iconName, 11), el("span", null, ` ${lbl}`));
        card.append(sp, el("strong", null, val));
        return card;
      }),
    );

    const diffSec = monthTotalSec - prevTotalSec;
    dom.calMonthCompare.className = "cal-compare-line";
    if (prevTotalSec > 0) {
      const pct = Math.round((diffSec / prevTotalSec) * 100);
      dom.calMonthCompare.classList.add(diffSec >= 0 ? "up" : "down");
      rich(dom.calMonthCompare, [
        { i: diffSec >= 0 ? "peak" : "chart", s: 12 },
        ` ${diffSec >= 0 ? "+" : "-"}${formatDuration(Math.abs(diffSec))} (${pct >= 0 ? "+" : ""}${pct}%) vs ${prevWord}`,
      ]);
      dom.calMonthCompare.hidden = false;
    } else {
      rich(dom.calMonthCompare, [
        { i: "info", s: 12 },
        ` Sin datos de ${prevWord} para comparar`,
      ]);
      dom.calMonthCompare.hidden = false;
    }

    if (dom.calRecordCard && isFull) {
      dom.calRecordCard.replaceChildren();
      const mkRow = (iconName, label, value, tone = "") => {
        const row = el("div", `cal-rec-row${tone ? ` ${tone}` : ""}`);
        row.append(ico(iconName, 15, "cal-rec-ico"));
        const box = el("div", "cal-rec-text");
        box.append(
          el("span", "cal-rec-label", label),
          el("strong", "cal-rec-value", value),
        );
        row.append(box);
        return row;
      };
      dom.calRecordCard.append(
        mkRow(
          "clock",
          `Total de ${rawMonthWord}`,
          formatDuration(monthTotalSec),
        ),
      );
      if (recordKey) {
        const rd = new Date(`${recordKey}T00:00:00`);
        const recBtn = el("button", "cal-rec-row record clickable");
        recBtn.type = "button";
        recBtn.append(ico("trophy", 15, "cal-rec-ico"));
        const box = el("div", "cal-rec-text");
        box.append(
          el("span", "cal-rec-label", "Día récord"),
          el(
            "strong",
            "cal-rec-value",
            `${F_DAY_SHORT.format(rd)} · ${formatDuration(monthMaxSec)}`,
          ),
        );
        recBtn.append(box, ico("chevronRight", 14, "cal-rec-go"));
        recBtn.addEventListener("click", () => {
          uiState.selectedDateKey = recordKey;
          uiState.calRangeAnchor = null;
          uiState.calRangeEnd = null;
          rerender();
        });
        dom.calRecordCard.append(recBtn);
      }
    }
  }

  // ================= TOP DEL MES =================
  const monthLoops = monthPlays.filter((it) => it.isLoop).length;
  const monthLikes = monthInter.filter((x) => x.type === "like").length;
  const monthSubs = monthInter.filter((x) => x.type === "subscribe").length;

  rich(dom.calMonthTopTitle, [
    `Top de ${rawMonthWord}`,
    monthPlays.length
      ? ` · ${formatDuration(monthTotalSec)} (${monthPlays.length}x)`
      : "",
    monthLoops ? { i: "loop", s: 12 } : null,
    monthLoops ? ` ${monthLoops}` : "",
    monthLikes ? { i: "heartFill", s: 12 } : null,
    monthLikes ? ` ${monthLikes}` : "",
    monthSubs ? { i: "bell", s: 12 } : null,
    monthSubs ? ` ${monthSubs}` : "",
  ]);

  if (monthPlays.length === 0) {
    uiState.monthTopVideoIds = [];
    uiState.monthCardData = null;
    dom.calMonthImgBtn.hidden = true;
    dom.calMonthPlaylistBtn.hidden = true;
    dom.calMonthTopList.replaceChildren();
    dom.calMonthTopEmpty.hidden = false;
    dom.calMonthChannelsBox.hidden = true;
    dom.calMonthCatsBox.hidden = true;
    dom.calWeekdayBox.hidden = true;
  } else {
    dom.calMonthTopEmpty.hidden = true;
    const topMonth = aggregateTracks(monthPlays);
    uiState.monthTopVideoIds = topMonth
      .map((t) => t.videoId)
      .filter(Boolean)
      .slice(0, 20);
    dom.calMonthPlaylistBtn.hidden = uiState.monthTopVideoIds.length === 0;

    const mChannels = new Map();
    const mCats = new Map();
    const weekdaySec = new Array(7).fill(0);
    const weekdayPlays = new Array(7).fill(0);
    for (const it of monthPlays) {
      const ak = it.artist || "YouTube";
      const curCh = mChannels.get(ak) || {
        name: ak,
        plays: 0,
        seconds: 0,
        artwork: it.artwork,
        url: it.channelUrl || "",
      };
      curCh.plays += 1;
      curCh.seconds += it.seconds || 0;
      if (!curCh.artwork && it.artwork) curCh.artwork = it.artwork;
      if (!curCh.url && it.channelUrl) curCh.url = it.channelUrl;
      mChannels.set(ak, curCh);
      const cat = it.category || (isMusicItem(it) ? "Music" : "");
      if (cat) {
        const curC = mCats.get(cat) || { plays: 0, seconds: 0 };
        curC.plays += 1;
        curC.seconds += it.seconds || 0;
        mCats.set(cat, curC);
      }
      const wdIdx = (new Date(it.timestamp).getDay() + 6) % 7;
      weekdaySec[wdIdx] += it.seconds || 0;
      weekdayPlays[wdIdx] += 1;
    }
    const sortedChannels = [...mChannels.values()].sort(
      (a, b) => b.seconds - a.seconds || b.plays - a.plays,
    );
    uiState.monthCardData = {
      subtitle: `${rawMonthWord.toUpperCase()} ${year}`,
      topTracks: topMonth.slice(0, 5),
      totalSeconds: monthTotalSec,
      totalPlays: monthPlays.length,
      totalLoops: monthLoops,
      topArtist: sortedChannels[0]?.name || "—",
    };
    dom.calMonthImgBtn.hidden = topMonth.length === 0;
    dom.calMonthTopList.replaceChildren(
      ...topMonth.slice(0, 10).map((track, idx) => {
        const mins =
          track.seconds > 0
            ? `${Math.max(1, Math.round(track.seconds / 60))}m`
            : "Imp.";
        const right =
          track.loops > 0
            ? `${track.plays}x (↻${track.loops}) · ${mins}`
            : `${track.plays}x · ${mins}`;
        return cleanRank(
          buildTrackRow(
            String(idx + 1),
            track.artwork,
            track.title,
            track.artist,
            right,
            {
              href: track.videoUrl || undefined,
            },
          ),
        );
      }),
    );

    const chWithTime = sortedChannels.filter((c) => c.seconds > 0);
    dom.calMonthChannelsBox.hidden = chWithTime.length === 0;
    if (chWithTime.length > 0) {
      rich(dom.calMonthChannelsTitle, [
        { i: "clock", s: 13 },
        ` Top canales de ${rawMonthWord}`,
      ]);
      const maxChSec = chWithTime[0].seconds;
      dom.calMonthChannelsList.replaceChildren(
        ...chWithTime.slice(0, 5).map((ch, idx) => {
          const share =
            monthTotalSec > 0
              ? Math.round((ch.seconds / monthTotalSec) * 100)
              : 0;
          const barPct =
            maxChSec > 0 ? Math.round((ch.seconds / maxChSec) * 100) : 0;
          return cleanRank(
            buildTrackRow(
              String(idx + 1),
              ch.artwork,
              ch.name,
              `${ch.plays} rep. · ${share}% del mes`,
              formatDuration(ch.seconds),
              { href: ch.url || undefined, barPct },
            ),
          );
        }),
      );
    }

    const catList = [...mCats.entries()].sort(
      (a, b) => b[1].seconds - a[1].seconds || b[1].plays - a[1].plays,
    );
    dom.calMonthCatsBox.hidden = catList.length === 0;
    if (catList.length > 0) {
      dom.calMonthCatsTitle.textContent = `Categorías de ${rawMonthWord}`;
      const totalCatW = catList.reduce(
        (acc, [, st]) => acc + (st.seconds || st.plays),
        0,
      );
      dom.calMonthCatsList.replaceChildren(
        ...catList.slice(0, 5).map(([cat, st]) => {
          const pct =
            totalCatW > 0
              ? Math.max(
                  4,
                  Math.round(((st.seconds || st.plays) / totalCatW) * 100),
                )
              : 0;
          const row = el("div", "cat-row");
          const top = el("div", "cat-row-top");
          top.append(
            el("span", null, translateCategory(cat)),
            el(
              "span",
              null,
              `${pct}% · ${st.plays}x (${formatDuration(st.seconds)})`,
            ),
          );
          const track = el("div", "cat-track");
          const fill = el("div", "cat-fill");
          fill.style.width = `${pct}%`;
          track.append(fill);
          row.append(top, track);
          return row;
        }),
      );
    }

    dom.calWeekdayBox.hidden = false;
    const usePlaysFallback = Math.max(...weekdaySec) === 0;
    const values = usePlaysFallback ? weekdayPlays : weekdaySec;
    const maxWd = Math.max(...values);
    dom.calWeekdayChart.replaceChildren(
      ...values.map((val, i) => {
        const col = el("div", "wd-col");
        col.title = `${WD_FULL[i]}: ${formatDuration(weekdaySec[i])} (${weekdayPlays[i]} rep.)`;
        const bar = el(
          "div",
          val === 0 ? "wd-bar zero" : val === maxWd ? "wd-bar peak" : "wd-bar",
        );
        bar.style.height =
          val === 0
            ? "4px"
            : `${Math.max(8, Math.round((val / maxWd) * 100))}%`;
        col.append(bar, el("span", "wd-lbl", WD_SHORT[i]));
        return col;
      }),
    );
  }

  dom.calMonthSocialBox.hidden = monthInter.length === 0;
  if (monthInter.length > 0) {
    dom.calMonthSocialTitle.textContent = `Me gusta y suscripciones de ${rawMonthWord}`;
    dom.calMonthSocialList.replaceChildren(
      ...monthInter
        .slice(0, 20)
        .map((it) => cleanRank(renderInteractionRow(it))),
    );
  }

  // ================= SEMANAS =================
  const weekRanges = getMondayWeeksOfMonth(year, month);
  const weekData = weekRanges.map((w) => {
    const items = monthPlays.filter((it) => {
      const day = new Date(it.timestamp).getDate();
      return day >= w.start && day <= w.end;
    });
    const sec = items.reduce((acc, it) => acc + (it.seconds || 0), 0);
    const rangeText =
      w.start === w.end
        ? `${w.start} ${shortMonth}`
        : `${w.start}–${w.end} ${shortMonth}`;
    return { w, items, sec, rangeText };
  });
  const maxWeekSec = Math.max(1, ...weekData.map((d) => d.sec));
  const weekNodes = [];

  if (isFull) {
    const strip = el("div", "weeks-strip");
    strip.setAttribute("role", "group");
    strip.setAttribute("aria-label", "Semanas del mes");
    for (const { w, items, sec, rangeText } of weekData) {
      const active = uiState.calWeekOpen === w.num;
      const chip = el(
        "button",
        `week-chip${items.length ? "" : " empty"}${active ? " active" : ""}`,
      );
      chip.type = "button";
      chip.disabled = items.length === 0;
      chip.setAttribute("aria-pressed", String(active));
      chip.title = items.length
        ? `Semana ${w.num} (${rangeText}): ${formatDuration(sec)} · ${items.length} rep.`
        : `Semana ${w.num} (${rangeText}): sin actividad`;
      chip.append(
        el("span", "wc-num", `S${w.num}`),
        el("span", "wc-range", rangeText),
      );
      const bar = el("span", "wc-bar");
      const fill = el("i");
      fill.style.width = `${items.length ? Math.max(6, Math.round((sec / maxWeekSec) * 100)) : 0}%`;
      bar.append(fill);
      chip.append(
        bar,
        el("span", "wc-val", items.length ? formatDuration(sec) : "—"),
      );
      chip.addEventListener("click", () => {
        uiState.calWeekOpen = active ? null : w.num;
        rerender();
      });
      strip.append(chip);
    }
    weekNodes.push(strip);
    if (uiState.calWeekOpen != null) {
      const hint = el("button", "weeks-show-all", "Ver todas las semanas");
      hint.type = "button";
      hint.addEventListener("click", () => {
        uiState.calWeekOpen = null;
        rerender();
      });
      weekNodes.push(hint);
    }
  }

  const visibleWeeks = weekData.filter(({ w, items }) => {
    if (uiState.calWeekOpen != null) return w.num === uiState.calWeekOpen;
    return isFull ? items.length > 0 : true;
  });

  for (const { w, items, sec, rangeText } of visibleWeeks) {
    const card = el(
      "div",
      items.length === 0 ? "week-card empty" : "week-card",
    );
    const header = el("div", "week-header");
    const title = el("span", "week-title", `Semana ${w.num} (${rangeText})`);
    const rightBox = el("div", "week-right");
    const meta = el("span", "week-meta");
    if (items.length === 0) {
      meta.textContent = "Sin actividad";
      rightBox.append(meta);
      header.append(title, rightBox);
      card.append(header);
      weekNodes.push(card);
      continue;
    }
    const wLoops = items.filter((it) => it.isLoop).length;
    meta.textContent = `${formatDuration(sec)} · ${items.length} rep.`;
    rightBox.append(meta);
    const topWeek = aggregateTracks(items);
    const wArtists = new Map();
    for (const it of items) {
      const k = it.artist || "YouTube";
      wArtists.set(k, (wArtists.get(k) || 0) + (it.seconds || 1));
    }
    const topWeekArtist =
      [...wArtists.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    const imgBtn = el("button", "mini-btn");
    imgBtn.type = "button";
    imgBtn.append(ico("export", 12));
    imgBtn.title = "Descargar tarjeta PNG de esta semana";
    imgBtn.setAttribute("aria-label", imgBtn.title);
    imgBtn.addEventListener("click", () =>
      onExportPng(
        {
          subtitle: `SEMANA ${w.num} (${rangeText.toUpperCase()})`,
          topTracks: topWeek.slice(0, 5),
          totalSeconds: sec,
          totalPlays: items.length,
          totalLoops: wLoops,
          topArtist: topWeekArtist,
        },
        imgBtn,
      ),
    );
    rightBox.append(imgBtn);
    const weekIds = topWeek
      .map((t) => t.videoId)
      .filter(Boolean)
      .slice(0, 20);
    if (weekIds.length > 0) {
      const plBtn = el("button", "mini-btn");
      plBtn.type = "button";
      plBtn.append(ico("play", 12));
      plBtn.title = "Crear playlist de esta semana";
      plBtn.setAttribute("aria-label", plBtn.title);
      plBtn.addEventListener("click", () => openInstantPlaylist(weekIds));
      rightBox.append(plBtn);
    }
    header.append(title, rightBox);
    const ul = el("ul", "week-tracks");
    ul.append(
      ...topWeek.slice(0, 3).map((track, idx) => {
        const mins =
          track.seconds > 0
            ? `${Math.max(1, Math.round(track.seconds / 60))}m`
            : "Imp.";
        const right =
          track.loops > 0
            ? `${track.plays}x (↻${track.loops}) · ${mins}`
            : `${track.plays}x · ${mins}`;
        return cleanRank(
          buildTrackRow(
            String(idx + 1),
            track.artwork,
            track.title,
            track.artist,
            right,
            {
              href: track.videoUrl || undefined,
            },
          ),
        );
      }),
    );
    card.append(header, ul);
    weekNodes.push(card);
  }

  if (
    !weekNodes.length ||
    (isFull && !visibleWeeks.length && uiState.calWeekOpen == null)
  ) {
    weekNodes.push(
      el(
        "p",
        "empty-msg small",
        "Ninguna semana de este mes tiene reproducciones.",
      ),
    );
  }
  dom.calWeeksList.replaceChildren(...weekNodes);
}

// ================= VISTA ANUAL =================
function renderAnnualView({
  dom,
  uiState,
  playsByDate,
  interByDate,
  searchesByDate,
  query,
  scale,
  levelFilter,
  isFull,
  rerender,
}) {
  const year = uiState.calYear;
  dom.calYearLabel.textContent = String(year);
  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);
  const startPad = (jan1.getDay() + 6) % 7;

  let yearSec = 0,
    yearPlays = 0,
    yearActiveDays = 0,
    yearMaxSec = 0,
    recordKey = null;
  const dayInfo = new Map();
  for (let d = new Date(jan1); d <= dec31; d.setDate(d.getDate() + 1)) {
    const key = toDateKey(d);
    const dp = playsByDate.get(key) || [];
    const di = interByDate.get(key) || [];
    const ds = searchesByDate.get(key) || [];
    const sec = dp.reduce((acc, p) => acc + (p.seconds || 0), 0);
    const hasAny = dp.length > 0 || di.length > 0 || ds.length > 0;
    if (hasAny) yearActiveDays += 1;
    yearSec += sec;
    yearPlays += dp.length;
    if (sec > yearMaxSec) {
      yearMaxSec = sec;
      recordKey = key;
    }
    dayInfo.set(key, { dp, di, ds, sec, hasAny });
  }

  const zoom = getZoom(uiState);
  const gap = zoom >= 14 ? 4 : 3;
  if (dom.calYearHeatmapScroll) {
    dom.calYearHeatmapScroll.style.setProperty("--yr-size", `${zoom}px`);
    dom.calYearHeatmapScroll.style.setProperty("--yr-gap", `${gap}px`);
  }
  dom.calYearZoom?.querySelectorAll("[data-yrzoom]").forEach((b) => {
    const on = Number(b.dataset.yrzoom) === zoom;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });

  const gridNodes = [];
  for (let i = 0; i < startPad; i++) {
    const pad = el("span", "yr-cell empty-pad");
    gridNodes.push(pad);
  }
  const monthLabels = [];
  let idx = startPad;
  for (let m = 0; m < 12; m++) {
    monthLabels.push({
      col: Math.floor(idx / 7) + 1,
      short: F_MONTH_SHORT.format(new Date(year, m, 1)).replace(".", ""),
    });
    const days = new Date(year, m + 1, 0).getDate();
    for (let day = 1; day <= days; day++) {
      const date = new Date(year, m, day);
      const key = toDateKey(date);
      const { dp, di, ds, sec, hasAny } = dayInfo.get(key);
      const level = hasAny
        ? scale === "relative"
          ? relLevel(sec, yearMaxSec)
          : absLevel(sec)
        : 0;
      const cell = el("button", "yr-cell");
      cell.type = "button";
      cell.dataset.key = key;
      if (level > 0) cell.classList.add(`heat-${level}`);
      if (key === recordKey && yearMaxSec > 0) cell.classList.add("is-record");
      if (key === uiState.selectedDateKey) cell.classList.add("selected");

      let dim = false;
      if (query) {
        const matches =
          dp.some((p) => doesEntryMatchQuery(p, "play", query)) ||
          di.some((it) => doesEntryMatchQuery(it, "inter", query)) ||
          ds.some((s) => doesEntryMatchQuery(s, "search", query));
        if (matches) cell.classList.add("match-filter");
        else if (hasAny) dim = true;
      }
      if (levelFilter != null && level !== levelFilter) dim = true;
      if (dim) cell.classList.add("dimmed");

      const lk = di.filter((x) => x.type === "like").length;
      const sb = di.filter((x) => x.type === "subscribe").length;
      const parts = [F_DAY_FULL.format(date)];
      if (hasAny) {
        if (dp.length) parts.push(`${formatDuration(sec)} (${dp.length} rep.)`);
        if (lk) parts.push(`${lk} likes`);
        if (sb) parts.push(`${sb} subs`);
        if (ds.length) parts.push(`${ds.length} búsquedas`);
        if (key === recordKey && yearMaxSec > 0)
          parts.push("día récord del año");
      } else parts.push("sin actividad");
      cell.title = parts.join(" · ");
      cell.setAttribute("aria-label", cell.title);

      const targetMonth = m;
      cell.addEventListener("click", () => {
        uiState.calViewMode = "month";
        uiState.calMonth = targetMonth;
        uiState.calYear = year;
        uiState.selectedDateKey = key;
        uiState.calRangeAnchor = null;
        uiState.calRangeEnd = null;
        document.querySelectorAll(".cal-mode-btn").forEach((b) => {
          b.classList.toggle("active", b.dataset.calview === "month");
        });
        rerender();
      });
      gridNodes.push(cell);
      idx += 1;
    }
  }

  rich(dom.calYearStats, [
    { i: "clock", s: 13 },
    ` ${formatDuration(yearSec)}`,
    { i: "playCircle", s: 13 },
    ` ${yearPlays} reproducciones`,
    { i: "calendarCheck", s: 13 },
    ` ${yearActiveDays} días activos`,
    recordKey ? { i: "trophy", s: 13 } : null,
    recordKey
      ? ` récord ${F_DAY_SHORT.format(new Date(`${recordKey}T00:00:00`))} (${formatDuration(yearMaxSec)})`
      : "",
  ]);
  dom.calYearGrid.replaceChildren(...gridNodes);

  const totalCols = Math.ceil(gridNodes.length / 7);
  if (dom.calYearMonths && isFull) {
    dom.calYearMonths.style.gridTemplateColumns = `repeat(${totalCols}, ${zoom}px)`;
    dom.calYearMonths.style.columnGap = `${gap}px`;
    dom.calYearMonths.replaceChildren(
      ...monthLabels.map((m) => {
        const s = el("span", "yr-mlabel", m.short);
        s.style.gridColumn = `${m.col} / span 4`;
        return s;
      }),
    );
  }
  if (dom.calYearDays && isFull) {
    dom.calYearDays.style.gridTemplateRows = `repeat(7, ${zoom}px)`;
    dom.calYearDays.style.rowGap = `${gap}px`;
    dom.calYearDays.replaceChildren(
      ...WD_SHORT.map((d, i) => el("span", "yr-dlabel", i % 2 === 0 ? d : "")),
    );
  }
  if (dom.calYearHeatmapScroll) {
    dom.calYearHeatmapScroll.scrollLeft = dom.calYearHeatmapScroll.scrollWidth;
  }

  const monthCards = [];
  for (let m = 0; m < 12; m++) {
    const mDate = new Date(year, m, 1);
    const mName = F_MONTH.format(mDate);
    const days = new Date(year, m + 1, 0).getDate();
    let mSec = 0,
      mPlays = 0;
    for (let day = 1; day <= days; day++) {
      const info = dayInfo.get(toDateKey(new Date(year, m, day)));
      mPlays += info.dp.length;
      mSec += info.sec;
    }
    const card = el(
      "button",
      mPlays === 0 ? "yr-month-card empty" : "yr-month-card",
    );
    card.type = "button";
    if (m === uiState.calMonth) card.classList.add("current");
    card.append(el("div", "yr-m-name", mName));
    card.append(
      el(
        "div",
        "yr-m-meta",
        mPlays > 0 ? `${formatDuration(mSec)} · ${mPlays}x` : "Sin datos",
      ),
    );
    if (isFull) {
      const weeks = getMondayWeeksOfMonth(year, m);
      const wSecs = weeks.map((w) => {
        let s = 0;
        for (let day = w.start; day <= w.end; day++)
          s += dayInfo.get(toDateKey(new Date(year, m, day))).sec;
        return s;
      });
      const wMax = Math.max(1, ...wSecs);
      const bars = el("div", "yr-m-bars");
      for (const s of wSecs) {
        const b = el("i", s > 0 ? "" : "zero");
        b.style.height = `${s > 0 ? Math.max(14, Math.round((s / wMax) * 100)) : 8}%`;
        bars.append(b);
      }
      card.append(bars);
    }
    card.addEventListener("click", () => {
      uiState.calViewMode = "month";
      uiState.calMonth = m;
      uiState.calYear = year;
      uiState.selectedDateKey = toDateKey(new Date(year, m, 1));
      uiState.calRangeAnchor = null;
      uiState.calRangeEnd = null;
      document.querySelectorAll(".cal-mode-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.calview === "month");
      });
      rerender();
    });
    monthCards.push(card);
  }
  dom.calYearMonthsGrid.replaceChildren(...monthCards);
}
