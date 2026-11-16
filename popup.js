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

const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");

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
    items.map((item) => {
      const d = new Date(item.timestamp);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }),
  );

  let streak = 0;
  const cursor = new Date();
  while (true) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
    if (daysSet.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else if (streak === 0) {
      // Permitir si hoy aún no escuchó nada pero ayer sí
      cursor.setDate(cursor.getDate() - 1);
      const yKey = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
      if (!daysSet.has(yKey)) break;
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

function renderHistory(history) {
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
    return;
  }

  emptyMsgEl.hidden = true;
  recentEmptyEl.hidden = true;

  let totalSeconds = 0;
  let totalLoops = 0;
  const tracksMap = new Map();
  const artistsMap = new Map();
  const hoursBuckets = new Array(24).fill(0);

  for (const item of filtered) {
    totalSeconds += item.seconds;
    if (item.isLoop) totalLoops += 1;

    const hour = new Date(item.timestamp).getHours();
    hoursBuckets[hour] += item.seconds;

    const current = tracksMap.get(item.trackKey) || {
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
    tracksMap.set(item.trackKey, current);

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

  const maxHourSec = Math.max(...hoursBuckets);
  const peakIdx = hoursBuckets.indexOf(maxHourSec);
  const streak = computeStreak(filtered);

  totalTimeEl.textContent = formatDuration(totalSeconds);
  totalPlaysEl.textContent = String(filtered.length);
  totalLoopsEl.textContent = `🔁 ${totalLoops}`;
  uniqueCountEl.textContent = String(tracksMap.size);
  streakDaysEl.textContent = `${streak} ${streak === 1 ? "día" : "días"}`;
  peakHourEl.textContent =
    maxHourSec > 0 ? `${String(peakIdx).padStart(2, "0")}:00h` : "—";

  // Top canciones/videos
  const topTracks = [...tracksMap.values()]
    .sort((a, b) => b.plays - a.plays || b.seconds - a.seconds)
    .slice(0, 15);

  topListEl.replaceChildren(
    ...topTracks.map((track, idx) => {
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

  // Reciente (últimos 25 en orden inverso)
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
      const right = formatClock(item.seconds);
      return buildTrackRow(
        item.isLoop ? "🔁" : "•",
        item.artwork,
        item.title,
        sub,
        right,
      );
    }),
  );

  // Gráfico 24 horas
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

  // Top 5 Artistas / Canales
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

// Reactividad en tiempo real cuando cambia nowPlaying o history
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
