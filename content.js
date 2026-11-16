(() => {
  const MIN_SECONDS_TO_COUNT = 20;
  const isMusic = location.hostname === "music.youtube.com";
  const source = isMusic ? "yt_music" : "youtube";

  let currentSession = null;

  function getTrackInfo() {
    const meta = navigator.mediaSession?.metadata;
    let title = meta?.title?.trim() || "";
    let artist = meta?.artist?.trim() || "";
    let artwork = meta?.artwork?.[meta.artwork.length - 1]?.src || "";

    // Respaldo por DOM en YouTube Music si mediaSession aún no cargó
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

    // Respaldo en YouTube normal
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
    // Clave única para agrupar la misma canción/video
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

  async function saveSession(session) {
    if (!session || session.seconds < MIN_SECONDS_TO_COUNT) return;

    const entry = {
      trackKey: session.trackKey,
      title: session.title,
      artist: session.artist,
      artwork: session.artwork,
      source: session.source,
      seconds: Math.round(session.seconds),
      timestamp: session.startedAt,
    };

    try {
      const data = await chrome.storage.local.get({ history: [] });
      data.history.push(entry);
      await chrome.storage.local.set({ history: data.history });
    } catch (err) {
      console.error("[YT Recap] Error guardando historial:", err);
    }
  }

  // Revisa cada 1 segundo si el reproductor está activo
  setInterval(() => {
    const video = document.querySelector("video");
    if (!video || video.paused || video.ended || video.readyState < 2) return;

    const info = getTrackInfo();
    if (!info) return;

    // Si cambió de canción/video, guardamos la sesión anterior
    if (currentSession && currentSession.trackKey !== info.trackKey) {
      saveSession(currentSession);
      currentSession = null;
    }

    if (!currentSession) {
      currentSession = {
        ...info,
        seconds: 0,
        lastVideoTime: video.currentTime,
        startedAt: Date.now(),
      };
    } else {
      // Si el usuario reinició o puso en bucle la misma canción, guardamos y abrimos nueva reproducción
      if (
        video.currentTime < 3 &&
        currentSession.lastVideoTime > MIN_SECONDS_TO_COUNT
      ) {
        saveSession(currentSession);
        currentSession = {
          ...info,
          seconds: 0,
          lastVideoTime: video.currentTime,
          startedAt: Date.now(),
        };
      } else {
        currentSession.seconds += 1;
        currentSession.lastVideoTime = video.currentTime;
        if (!currentSession.artwork && info.artwork) {
          currentSession.artwork = info.artwork;
        }
      }
    }
  }, 1000);

  // Guardar si se cierra o recarga la pestaña
  window.addEventListener("pagehide", () => {
    if (currentSession) {
      saveSession(currentSession);
      currentSession = null;
    }
  });
})();
