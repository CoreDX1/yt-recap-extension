// src/takeout.js

function parseTakeoutWatchHistory(entries) {
  const imported = [];
  for (const item of entries) {
    if (!item?.titleUrl || !item?.time) continue;
    if (item.details?.some((d) => String(d.name || "").includes("Ads")))
      continue;

    let videoId = "";
    let contentType = "video";
    try {
      const u = new URL(item.titleUrl);
      videoId = u.searchParams.get("v") || "";
      if (!videoId) {
        const m = u.pathname.match(/^\/(?:shorts|live)\/([^/?#]+)/);
        if (m) videoId = m[1];
      }
      if (u.pathname.startsWith("/shorts/")) contentType = "short";
    } catch {
      continue;
    }

    if (!videoId) continue;

    const isYtMusic = item.header === "YouTube Music";
    if (isYtMusic && contentType === "video") contentType = "music";

    const cleanTitle = String(item.title || "")
      .replace(
        /^(Watched|Has visto|Viste|Miraste|Escuchaste|Listened to)\s+/i,
        "",
      )
      .trim();
    if (!cleanTitle) continue;

    const artist = item.subtitles?.[0]?.name?.trim() || "YouTube";
    const channelUrl = item.subtitles?.[0]?.url || "";
    const ts = new Date(item.time).getTime();
    if (!Number.isFinite(ts)) continue;

    imported.push({
      id: `takeout-${ts}-${videoId}`,
      trackKey: isYtMusic
        ? `ytm::${cleanTitle.toLowerCase()}::${artist.toLowerCase()}`
        : `yt::${videoId}::${cleanTitle.toLowerCase()}`,
      videoId,
      videoUrl: item.titleUrl,
      title: cleanTitle,
      artist,
      album: "",
      category: isYtMusic ? "Music" : "",
      artwork: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      channelUrl,
      source: isYtMusic ? "yt_music" : "youtube",
      contentType,
      context: "direct",
      playlistId: "",
      duration: 0,
      completionPct: null,
      playbackRate: 1,
      mostlyMuted: false,
      seconds: 0,
      isLoop: false,
      imported: true,
      timestamp: ts,
    });
  }
  return imported;
}

function parseTakeoutSearchHistory(entries) {
  const searches = [];
  for (const item of entries) {
    if (!item?.titleUrl || !item?.time) continue;
    if (
      !item.titleUrl.includes("search_query=") &&
      !item.titleUrl.includes("/search?")
    )
      continue;

    const query = String(item.title || "")
      .replace(/^(Searched for|Buscaste|Has buscado)\s+/i, "")
      .trim();
    const ts = new Date(item.time).getTime();
    if (!query || !Number.isFinite(ts)) continue;

    const isYtMusic = item.header === "YouTube Music";
    searches.push({
      id: `sr-takeout-${ts}-${query.toLowerCase().slice(0, 16)}`,
      query,
      normalized: query.toLowerCase(),
      url: item.titleUrl,
      source: isYtMusic ? "yt_music" : "youtube",
      timestamp: ts,
    });
  }
  return searches;
}

function mergeUniqueById(target, incoming) {
  if (!Array.isArray(incoming)) return 0;
  const ids = new Set(target.map((x) => x.id));
  let added = 0;
  for (const item of incoming) {
    if (item?.id && !ids.has(item.id)) {
      target.push(item);
      ids.add(item.id);
      added += 1;
    }
  }
  return added;
}

export function importBackupPayload(parsed, currentData) {
  const next = {
    history: [...currentData.history],
    channelVisits: [...currentData.channelVisits],
    skips: [...currentData.skips],
    interactions: [...currentData.interactions],
    searches: [...currentData.searches],
  };

  if (Array.isArray(parsed)) {
    const watchAdded = mergeUniqueById(
      next.history,
      parseTakeoutWatchHistory(parsed),
    );
    const searchAdded = mergeUniqueById(
      next.searches,
      parseTakeoutSearchHistory(parsed),
    );
    const parts = [];
    if (watchAdded > 0) parts.push(`${watchAdded} reproducciones`);
    if (searchAdded > 0) parts.push(`${searchAdded} búsquedas`);
    return {
      updatedData: next,
      message: parts.length
        ? `✓ Google Takeout importado: ${parts.join(" y ")}.`
        : "✓ Archivo analizado: no había registros nuevos para agregar.",
    };
  }

  if (parsed && Array.isArray(parsed.history)) {
    const addedPlays = mergeUniqueById(next.history, parsed.history);
    mergeUniqueById(next.channelVisits, parsed.channelVisits);
    mergeUniqueById(next.skips, parsed.skips);
    mergeUniqueById(next.interactions, parsed.interactions);
    mergeUniqueById(next.searches, parsed.searches);

    return {
      updatedData: next,
      message: `✓ Backup restaurado (+${addedPlays} reproducciones).`,
    };
  }

  throw new Error(
    "El archivo no tiene formato de backup de la extensión ni de Google Takeout.",
  );
}
