(() => {
  const MIN_SECONDS_TO_COUNT = 20;
  const MIN_SECONDS_ON_LOOP = 3;
  const isMusic = location.hostname === "music.youtube.com";
  const source = isMusic ? "yt_music" : "youtube";

  let currentSession = null;
  let saveQueue = Promise.resolve();

  function enqueueStorage(fn) {
    saveQueue = saveQueue.then(fn).catch((err) => {
      console.error("[YT Recap] Error de almacenamiento:", err);
    });
    return saveQueue;
  }

  function getTrackInfo() {
    if (document.querySelector(".ad-showing")) return null;

    const meta = navigator.mediaSession?.metadata;
    let title = meta?.title?.trim() || "";
    let artist = meta?.artist?.trim() || "";
    let artwork = meta?.artwork?.[meta.artwork.length - 1]?.src || "";

    if (isMusic && !title) {
      title =
        document
          .querySelector("ytmusic-player-bar .title")
          ?.textContent?.trim() || "";
      artist =
        document
          .querySelector("ytmusic-player-bar .byline a")
          ?.textContent?.trim() || "Desconocido";
    }

    if (!isMusic && !title) {
      title =
        document
          .querySelector("h1.ytd-watch-metadata yt-formatted-string")
          ?.textContent?.trim() || "";
      artist =
        document.querySelector("#owner #channel-name a")?.textContent?.trim() ||
        "Canal";
    }

    if (!title) return null;

    const videoId = new URLSearchParams(location.search).get("v") || "";
    const trackKey = isMusic
      ? `ytm::${title.toLowerCase()}::${artist.toLowerCase()}`
      : `yt::${videoId || title.toLowerCase()}`;

    return {
      trackKey,
      title,
      artist: artist || "Desconocido",
      artwork,
      source,
    };
  }

  function createSession(info, videoTime, duration, isLoop = false) {
    let minRequired = MIN_SECONDS_TO_COUNT;
    if (isLoop) {
      minRequired = MIN_SECONDS_ON_LOOP;
    } else if (
      Number.isFinite(duration) &&
      duration > 0 &&
      duration < MIN_SECONDS_TO_COUNT
    ) {
      minRequired = Math.max(5, Math.floor(duration * 0.8));
    }

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...info,
      seconds: 0,
      minRequired,
      isLoop,
      maxTimeReached: videoTime || 0,
      lastSavedSeconds: -10,
      startedAt: Date.now(),
    };
  }

  function upsertSession(session, force = false) {
    if (!session || session.seconds < session.minRequired) return;
    if (!force && session.seconds - session.lastSavedSeconds < 5) return;

    const snapshot = {
      id: session.id,
      trackKey: session.trackKey,
      title: session.title,
      artist: session.artist,
      artwork: session.artwork,
      source: session.source,
      seconds: Math.round(session.seconds),
      isLoop: session.isLoop,
      timestamp: session.startedAt,
    };

    session.lastSavedSeconds = session.seconds;

    enqueueStorage(async () => {
      const data = await chrome.storage.local.get({ history: [] });
      const idx = data.history.findIndex((item) => item.id === snapshot.id);
      if (idx >= 0) {
        data.history[idx] = snapshot;
      } else {
        data.history.push(snapshot);
      }
      await chrome.storage.local.set({ history: data.history });
    });
  }

  setInterval(() => {
    const video = document.querySelector("video");
    if (!video || video.paused || video.ended || video.readyState < 2) return;

    const info = getTrackInfo();
    if (!info) return;

    // Si cambió a otro video/canción
    if (currentSession && currentSession.trackKey !== info.trackKey) {
      upsertSession(currentSession, true);
      currentSession = null;
    }

    if (!currentSession) {
      currentSession = createSession(
        info,
        video.currentTime,
        video.duration,
        false,
      );
      return;
    }

    const dur = Number.isFinite(video.duration) ? video.duration : 0;
    const nearEnd =
      dur > 0 && currentSession.maxTimeReached >= Math.max(5, dur - 8);
    const restarted =
      currentSession.maxTimeReached > 8 && video.currentTime < 5;

    // Si volvió al inicio después de haber avanzado o llegado al final
    if (
      restarted &&
      (video.loop ||
        nearEnd ||
        currentSession.seconds >= currentSession.minRequired)
    ) {
      const isActualLoop = Boolean(video.loop || nearEnd);
      upsertSession(currentSession, true);
      currentSession = createSession(
        info,
        video.currentTime,
        dur,
        isActualLoop,
      );
      return;
    }

    currentSession.seconds += 1;
    if (video.currentTime > currentSession.maxTimeReached) {
      currentSession.maxTimeReached = video.currentTime;
    }
    if (!currentSession.artwork && info.artwork) {
      currentSession.artwork = info.artwork;
    }

    // Si es un bucle y recién cumplió los 3s, lo guarda inmediatamente
    const justUnlockedLoop =
      currentSession.isLoop &&
      currentSession.seconds === currentSession.minRequired;
    upsertSession(currentSession, justUnlockedLoop);
  }, 1000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && currentSession) {
      upsertSession(currentSession, true);
    }
  });

  window.addEventListener("pagehide", () => {
    if (currentSession) {
      upsertSession(currentSession, true);
      currentSession = null;
    }
  });
})();
