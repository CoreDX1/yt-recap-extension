const periodSelect = document.getElementById("periodSelect");
const sourceSelect = document.getElementById("sourceSelect");

// En vivo
const npEmpty = document.getElementById("npEmpty");
const npContent = document.getElementById("npContent");
const npThumb = document.getElementById("npThumb");
const npStatusBadge = document.getElementById("npStatusBadge");
const npSourceBadge = document.getElementById("npSourceBadge");
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
const topListEl = document.getElementById("topList");
const emptyMsgEl = document.getElementById("emptyMsg");

// Reciente & Actividad
const recentListEl = document.getElementById("recentList");
const recentEmptyEl = document.getElementById("recentEmpty");
const hoursChartEl = document.getElementById("hoursChart");
const topArtistsListEl = document.getElementById("topArtistsList");

// Calendario
const calMonthLabel = document.getElementById("calMonthLabel");
const calPrevBtn = document.getElementById("calPrevBtn");
const calNextBtn = document.getElementById("calNextBtn");
const calTodayBtn = document.getElementById("calTodayBtn");
const calGrid = document.getElementById("calGrid");
const calDayTitle = document.getElementById("calDayTitle");
const calDayList = document.getElementById("calDayList");
const calDayEmpty = document.getElementById("calDayEmpty");
const calWeeksTitle = document.getElementById("calWeeksTitle");
const calWeeksList = document.getElementById("calWeeksList");

const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");

const nowInit = new Date();
let calYear = nowInit.getFullYear();
let calMonth = nowInit.getMonth();
let selectedDateKey = toDateKey(nowInit);
let cachedHistory = [];

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getGroupKey(item) {
  return `${item.trackKey || item.source}::${(item.title || "").trim().toLowerCase()}`;
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

function renderNowPlaying(np) {
  const isStale = !np || (!np.paused && Date.now() - np.updatedAt > 6000);
  if (isStale) {
    npEmpty.hidden = false;
    npContent.hidden = true;
    return;
  }

  npEmpty.hidden = true;
  npContent.hidden = false;

  if (np.artwork) {
    npThumb.src = np.artwork;
  } else {
    npThumb.removeAttribute("src");
  }

  npStatusBadge.textContent = np.paused ? "⏸ En pausa" : "● En vivo";
  npStatusBadge.classList.toggle("paused", np.paused);

  npSourceBadge.textContent = np.source === "yt_music" ? "YT Music" : "YouTube";
  npLoopBadge.hidden = !(np.loopActive || np.isLoopSession);

  npTitle.textContent = np.title;
  npArtist.textContent = np.artist;

  const pct =
    np.duration > 0 ? Math.min(100, (np.currentTime / np.duration) * 100) : 0;
  npBarFill.style.width = `${pct.toFixed(1)}%`;
  npTime.textContent =
    np.duration > 0
      ? `${formatClock(np.currentTime)} / ${formatClock(np.duration)}`
      : formatClock(np.currentTime);

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

function buildTrackRow(rankText, artwork, titleText, subText, rightText) {
  const li = document.createElement("li");
  li.className = "top-item";

  const rank = document.createElement("span");
  rank.className = "rank";
  rank.textContent = rankText;

  const img = document.createElement("img");
  img.className = "thumb";
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

  li.append(rank, img, meta, stats);
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
      plays: 0,
      loops: 0,
      seconds: 0,
    };
    current.plays += 1;
    if (item.isLoop) current.loops += 1;
    current.seconds += item.seconds;
    if (!current.artwork && item.artwork) current.artwork = item.artwork;
    map.set(key, current);
  }
  return [...map.values()].sort(
    (a, b) => b.plays - a.plays || b.seconds - a.seconds,
  );
}

function renderHistory(history) {
  cachedHistory = history;
  const days = periodSelect.value;
  const sourceFilter = sourceSelect.value;
  const now = Date.now();
  const cutoff = days === "all" ? 0 : now - Number(days) * 24 * 60 * 60 * 1000;

  const filtered = history.filter((item) => {
    const matchDate = item.timestamp >= cutoff;
    const matchSource = sourceFilter === "all" || item.source === sourceFilter;
    return matchDate && matchSource;
  });

  if (filtered.length === 0) {
    totalTimeEl.textContent = "0 min";
    totalPlaysEl.textContent = "0";
    totalLoopsEl.textContent = "🔁 0";
    uniqueCountEl.textContent = "0";
    streakDaysEl.textContent = "0 días";
    peakHourEl.textContent = "—";
    topListEl.replaceChildren();
    recentListEl.replaceChildren();
    topArtistsListEl.replaceChildren();
    hoursChartEl.replaceChildren();
    emptyMsgEl.hidden = false;
    recentEmptyEl.hidden = false;
  } else {
    emptyMsgEl.hidden = true;
    recentEmptyEl.hidden = true;

    let totalSeconds = 0;
    let totalLoops = 0;
    const artistsMap = new Map();
    const hoursBuckets = new Array(24).fill(0);

    for (const item of filtered) {
      totalSeconds += item.seconds;
      if (item.isLoop) totalLoops += 1;

      const hour = new Date(item.timestamp).getHours();
      hoursBuckets[hour] += item.seconds;

      const artistKey = item.artist || "Desconocido";
      const artistStats = artistsMap.get(artistKey) || {
        plays: 0,
        seconds: 0,
        artwork: item.artwork,
      };
      artistStats.plays += 1;
      artistStats.seconds += item.seconds;
      if (!artistStats.artwork && item.artwork)
        artistStats.artwork = item.artwork;
      artistsMap.set(artistKey, artistStats);
    }

    const topTracksAll = aggregateTracks(filtered);
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
        const mins = Math.max(1, Math.round(track.seconds / 60));
        const right =
          track.loops > 0
            ? `${track.plays}x (🔁${track.loops}) · ${mins}m`
            : `${track.plays}x · ${mins}m`;
        return buildTrackRow(
          String(idx + 1),
          track.artwork,
          track.title,
          track.artist,
          right,
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
        const sub = `${item.artist} · ${timeStr}${item.isLoop ? " · 🔁 Bucle" : ""}`;
        return buildTrackRow(
          item.isLoop ? "🔁" : "•",
          item.artwork,
          item.title,
          sub,
          formatClock(item.seconds),
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

    const topArtists = [...artistsMap.entries()]
      .sort((a, b) => b[1].seconds - a[1].seconds)
      .slice(0, 5);

    topArtistsListEl.replaceChildren(
      ...topArtists.map(([name, st], idx) =>
        buildTrackRow(
          String(idx + 1),
          st.artwork,
          name,
          `${st.plays} reproducciones`,
          formatDuration(st.seconds),
        ),
      ),
    );
  }

  renderCalendar();
}

function renderCalendar() {
  const sourceFilter = sourceSelect.value;
  const sourceItems = cachedHistory.filter(
    (item) => sourceFilter === "all" || item.source === sourceFilter,
  );

  // Agrupar actividad por fecha YYYY-MM-DD
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

  const shortMonth = new Intl.DateTimeFormat("es-AR", {
    month: "short",
  }).format(monthDate);
  calWeeksTitle.textContent = `Top por semana de ${monthName.split(" ")[0]}`;

  const firstWeekday = monthDate.getDay(); // 0 (Dom) - 6 (Sáb)
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const prevMonthDays = new Date(calYear, calMonth, 0).getDate();
  const todayKey = toDateKey(new Date());

  const cells = [];

  // Relleno días del mes anterior
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const d = new Date(calYear, calMonth - 1, prevMonthDays - i);
    cells.push({ date: d, otherMonth: true });
  }

  // Días del mes actual
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(calYear, calMonth, day);
    cells.push({ date: d, otherMonth: false });
  }

  // Relleno días del mes siguiente hasta completar filas de 7
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(calYear, calMonth + 1, i);
    cells.push({ date: d, otherMonth: true });
  }

  const dayButtons = cells.map(({ date, otherMonth }) => {
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
  });

  calGrid.replaceChildren(...dayButtons);

  // Detalle del día seleccionado
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
  const dayTotalSec = dayItems.reduce((acc, it) => acc + it.seconds, 0);

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
        return buildTrackRow(
          item.isLoop ? "🔁" : "•",
          item.artwork,
          item.title,
          sub,
          formatClock(item.seconds),
        );
      }),
    );
  }

  // Top por cada semana del mes (1-7, 8-14, 15-21, 22-28, 29-fin)
  const weekRanges = [
    { num: 1, start: 1, end: 7 },
    { num: 2, start: 8, end: 14 },
    { num: 3, start: 15, end: 21 },
    { num: 4, start: 22, end: 28 },
  ];
  if (daysInMonth > 28) {
    weekRanges.push({ num: 5, start: 29, end: daysInMonth });
  }

  const monthItems = sourceItems.filter((item) => {
    const d = new Date(item.timestamp);
    return d.getFullYear() === calYear && d.getMonth() === calMonth;
  });

  const weekCards = weekRanges.map((w) => {
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

    const meta = document.createElement("span");
    meta.className = "week-meta";

    if (wItems.length === 0) {
      meta.textContent = "Sin actividad";
      header.append(title, meta);
      card.append(header);
      return card;
    }

    const wSec = wItems.reduce((acc, it) => acc + it.seconds, 0);
    meta.textContent = `${formatDuration(wSec)} · ${wItems.length} rep.`;
    header.append(title, meta);

    const topWeek = aggregateTracks(wItems).slice(0, 3);
    const ul = document.createElement("ul");
    ul.className = "week-tracks";
    ul.append(
      ...topWeek.map((track, idx) => {
        const mins = Math.max(1, Math.round(track.seconds / 60));
        const right =
          track.loops > 0
            ? `${track.plays}x (🔁${track.loops}) · ${mins}m`
            : `${track.plays}x · ${mins}m`;
        return buildTrackRow(
          String(idx + 1),
          track.artwork,
          track.title,
          track.artist,
          right,
        );
      }),
    );

    card.append(header, ul);
    return card;
  });

  calWeeksList.replaceChildren(...weekCards);
}

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

// Carga inicial
async function init() {
  const { history = [], nowPlaying = null } = await chrome.storage.local.get({
    history: [],
    nowPlaying: null,
  });
  renderNowPlaying(nowPlaying);
  renderHistory(history);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.nowPlaying) {
    renderNowPlaying(changes.nowPlaying.newValue);
  }
  if (changes.history) {
    renderHistory(changes.history.newValue || []);
  }
});

periodSelect.addEventListener("change", init);
sourceSelect.addEventListener("change", init);

exportBtn.addEventListener("click", async () => {
  const { history = [] } = await chrome.storage.local.get({ history: [] });
  const blob = new Blob([JSON.stringify(history, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `youtube-recap-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

clearBtn.addEventListener("click", async () => {
  if (
    confirm(
      "¿Seguro que querés borrar todo el historial guardado en la extensión?",
    )
  ) {
    await chrome.storage.local.set({ history: [] });
  }
});

init();
