const periodSelect = document.getElementById("periodSelect");
const sourceSelect = document.getElementById("sourceSelect");
const totalTimeEl = document.getElementById("totalTime");
const totalPlaysEl = document.getElementById("totalPlays");
const topArtistEl = document.getElementById("topArtist");
const topListEl = document.getElementById("topList");
const emptyMsgEl = document.getElementById("emptyMsg");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");

function formatDuration(totalSeconds) {
  const mins = Math.round(totalSeconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs} h ${rem} m`;
}

async function renderRecap() {
  const { history = [] } = await chrome.storage.local.get({ history: [] });

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
    topArtistEl.textContent = "—";
    topListEl.replaceChildren();
    emptyMsgEl.hidden = false;
    return;
  }

  emptyMsgEl.hidden = true;

  let totalSeconds = 0;
  const tracksMap = new Map();
  const artistsMap = new Map();

  for (const item of filtered) {
    totalSeconds += item.seconds;

    // Agrupar por canción/video
    const current = tracksMap.get(item.trackKey) || {
      title: item.title,
      artist: item.artist,
      artwork: item.artwork,
      plays: 0,
      seconds: 0,
    };
    current.plays += 1;
    current.seconds += item.seconds;
    if (!current.artwork && item.artwork) current.artwork = item.artwork;
    tracksMap.set(item.trackKey, current);

    // Agrupar por artista/canal
    const artistKey = item.artist || "Desconocido";
    const artistStats = artistsMap.get(artistKey) || { plays: 0, seconds: 0 };
    artistStats.plays += 1;
    artistStats.seconds += item.seconds;
    artistsMap.set(artistKey, artistStats);
  }

  // Ordenar Top Artistas por tiempo escuchado
  const topArtists = [...artistsMap.entries()].sort(
    (a, b) => b[1].seconds - a[1].seconds,
  );
  const topTracks = [...tracksMap.values()]
    .sort((a, b) => b.plays - a.plays || b.seconds - a.seconds)
    .slice(0, 15);

  totalTimeEl.textContent = formatDuration(totalSeconds);
  totalPlaysEl.textContent = String(filtered.length);
  topArtistEl.textContent = topArtists[0]
    ? `${topArtists[0][0]} (${formatDuration(topArtists[0][1].seconds)})`
    : "—";

  const nodes = topTracks.map((track, idx) => {
    const li = document.createElement("li");
    li.className = "top-item";

    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = String(idx + 1);

    const img = document.createElement("img");
    img.className = "thumb";
    if (track.artwork) img.src = track.artwork;
    img.alt = "";

    const meta = document.createElement("div");
    meta.className = "meta";

    const title = document.createElement("div");
    title.className = "track-title";
    title.textContent = track.title;

    const sub = document.createElement("div");
    sub.className = "track-sub";
    sub.textContent = track.artist;

    meta.append(title, sub);

    const stats = document.createElement("div");
    stats.className = "track-stats";
    stats.textContent = `${track.plays}x · ${Math.max(1, Math.round(track.seconds / 60))}m`;

    li.append(rank, img, meta, stats);
    return li;
  });

  topListEl.replaceChildren(...nodes);
}

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
    renderRecap();
  }
});

periodSelect.addEventListener("change", renderRecap);
sourceSelect.addEventListener("change", renderRecap);
renderRecap();
