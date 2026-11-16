(() => {
  const MIN_SECONDS_TO_COUNT = 20;
  const MIN_SECONDS_ON_LOOP = 3;
  const isMusic = location.hostname === "music.youtube.com";
  const source = isMusic ? "yt_music" : "youtube";
  const tabInstanceId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  let currentSession = null;
  let lastPausedReported = null;
  let saveQueue = Promise.resolve();
  let timerId = null;

  function isContextValid() {
    return Boolean(
      typeof chrome !== "undefined" &&
      chrome.runtime?.id &&
      chrome.storage?.local,
    );
  }

  function stopIfInvalid() {
    if (!isContextValid()) {
      if (timerId) clearInterval(timerId);
      return true;
    }
    return false;
  }

  function enqueueStorage(fn) {
    if (stopIfInvalid()) return saveQueue;
    saveQueue = saveQueue.then(fn).catch((err) => {
      if (
        String(err?.message || err)
          .toLowerCase()
          .includes("context invalidated")
      ) {
        if (timerId) clearInterval(timerId);
        return;
      }
      console.error("[YT Recap] Error de almacenamiento:", err);
    });
    return saveQueue;
  }

  function extractVideoId() {
    const vParam = new URLSearchParams(location.search).get("v");
    if (vParam) return vParam;
    const match = location.pathname.match(
      /^\/(?:shorts|live|embed)\/([^/?#]+)/,
    );
    return match ? match[1] : "";
  }

  function getActiveVideo() {
    const all = [...document.querySelectorAll("video")];
    const playing = all.find((v) => !v.paused && !v.ended && v.readyState >= 2);
    if (playing) return playing;
    return (
      document.querySelector("#movie_player video.html5-main-video") ||
      all[0] ||
      null
    );
  }

  function getTrackInfo() {
    if (document.querySelector("#movie_player.ad-showing")) return null;

    const videoId = extractVideoId();
    const meta = navigator.mediaSession?.metadata;
    const metaTitle = meta?.title?.trim() || "";
    const metaArtist = meta?.artist?.trim() || "";
    let artwork = meta?.artwork?.[meta.artwork.length - 1]?.src || "";

    let domTitle = "";
    let domArtist = "";

    if (isMusic) {
      domTitle =
        document
          .querySelector("ytmusic-player-bar .title")
          ?.textContent?.trim() || "";
      const byline =
        document
          .querySelector("ytmusic-player-bar .byline")
          ?.textContent?.trim() || "";
      domArtist = byline.split("•")[0]?.trim() || "";
    } else {
      domTitle =
        document
          .querySelector(
            "h1.ytd-watch-metadata, #title h1, ytd-reel-video-renderer[is-active] h2",
          )
          ?.textContent?.trim() || "";
      domArtist =
        document
          .querySelector(
            "ytd-watch-metadata #channel-name a, #upload-info #channel-name a, ytd-channel-name a, ytd-reel-video-renderer[is-active] #channel-name a",
          )
          ?.textContent?.trim() || "";
    }

    const docTitle = document.title
      .replace(/^\(\d+\)\s*/, "")
      .replace(/\s*-\s*YouTube(\s+Music)?$/i, "")
      .trim();

    const title = isMusic
      ? metaTitle || domTitle || docTitle
      : domTitle ||
        metaTitle ||
        docTitle ||
        (videoId ? `Video (${videoId})` : "");

    if (!title) return null;

    const artist =
      (isMusic ? metaArtist || domArtist : domArtist || metaArtist) ||
      "YouTube";

    if (!artwork && videoId) {
      artwork = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    }

    const trackKey = isMusic
      ? `ytm::${title.toLowerCase()}::${artist.toLowerCase()}`
      : `yt::${videoId}::${title.toLowerCase()}`;

    return { trackKey, title, artist, artwork, source };
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
    if (stopIfInvalid()) return;
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
      if (stopIfInvalid()) return;
      const data = await chrome.storage.local.get({ history: [] });
      const history = Array.isArray(data.history) ? data.history : [];
      const idx = history.findIndex((item) => item.id === snapshot.id);
      if (idx >= 0) {
        history[idx] = snapshot;
      } else {
        history.push(snapshot);
      }
      await chrome.storage.local.set({ history });
    });
  }

  async function publishNowPlaying(video, info) {
    if (stopIfInvalid() || !video || !info) return;

    try {
      const isPaused = Boolean(video.paused || video.ended);
      if (isPaused) {
        if (lastPausedReported === true) return;
        const { nowPlaying } = await chrome.storage.local.get({
          nowPlaying: null,
        });
        if (
          nowPlaying &&
          nowPlaying.tabInstanceId !== tabInstanceId &&
          !nowPlaying.paused &&
          Date.now() - nowPlaying.updatedAt < 3000
        ) {
          return;
        }
      }

      lastPausedReported = isPaused;
      const dur = Number.isFinite(video.duration) ? video.duration : 0;

      await chrome.storage.local.set({
        nowPlaying: {
          tabInstanceId,
          title: info.title,
          artist: info.artist,
          artwork: info.artwork,
          source: info.source,
          currentTime: Math.floor(video.currentTime || 0),
          duration: Math.floor(dur),
          paused: isPaused,
          loopActive: Boolean(video.loop),
          sessionSeconds: currentSession ? currentSession.seconds : 0,
          minRequired: currentSession
            ? currentSession.minRequired
            : MIN_SECONDS_TO_COUNT,
          isLoopSession: currentSession ? currentSession.isLoop : false,
          updatedAt: Date.now(),
        },
      });
    } catch (err) {
      if (
        String(err?.message || err)
          .toLowerCase()
          .includes("context invalidated")
      ) {
        if (timerId) clearInterval(timerId);
      }
    }
  }

  timerId = setInterval(() => {
    if (stopIfInvalid()) return;

    const video = getActiveVideo();
    const info = getTrackInfo();

    if (!video || !info) return;

    if (video.paused || video.ended || video.readyState < 2) {
      publishNowPlaying(video, info);
      return;
    }

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
    } else {
      // Autocorregir título/artista/portada si YouTube tardó 1s en actualizar el DOM tras cambiar de video
      if (info.title && currentSession.title !== info.title)
        currentSession.title = info.title;
      if (
        info.artist &&
        info.artist !== "YouTube" &&
        currentSession.artist !== info.artist
      ) {
        currentSession.artist = info.artist;
      }
      if (info.artwork && !currentSession.artwork)
        currentSession.artwork = info.artwork;

      const dur = Number.isFinite(video.duration) ? video.duration : 0;
      const nearEnd =
        dur > 0 && currentSession.maxTimeReached >= Math.max(5, dur - 8);
      const restarted =
        currentSession.maxTimeReached > 8 && video.currentTime < 5;

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
      } else {
        currentSession.seconds += 1;
        if (video.currentTime > currentSession.maxTimeReached) {
          currentSession.maxTimeReached = video.currentTime;
        }

        const justUnlocked =
          currentSession.seconds === currentSession.minRequired;
        upsertSession(currentSession, justUnlocked);
      }
    }

    publishNowPlaying(video, info);
  }, 1000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && currentSession) {
      upsertSession(currentSession, true);
    }
  });

  window.addEventListener("pagehide", async () => {
    if (currentSession) {
      upsertSession(currentSession, true);
      currentSession = null;
    }
    if (isContextValid()) {
      try {
        const { nowPlaying } = await chrome.storage.local.get({
          nowPlaying: null,
        });
        if (nowPlaying?.tabInstanceId === tabInstanceId) {
          await chrome.storage.local.remove("nowPlaying");
        }
      } catch {
        // Ignorar si el contexto ya cerró
      }
    }
  });
})();
