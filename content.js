(() => {
  const CONFIG = {
    MIN_SECONDS_TO_COUNT: 20,
    MIN_SECONDS_ON_LOOP: 3,
    SAVE_INTERVAL_SEC: 5,
    TICK_MS: 1000,
    MAX_SKIPS: 1000,
    MAX_SEARCHES: 2000,
  };

  const isMusic = location.hostname === "music.youtube.com";
  const source = isMusic ? "yt_music" : "youtube";
  const tabInstanceId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const npStorageKey = `np_${tabInstanceId}`;

  const state = {
    session: null,
    lastPausedReported: null,
    channelVisit: null,
    pendingChannel: null,
    activeSearchKey: null,
    timerId: null,
  };

  let saveQueue = Promise.resolve();
  const categoryCache = new Map();
  const fetchingCategories = new Set();
  const boundVideos = new WeakSet();

  // --- SEGURIDAD DE CONTEXTO Y COLA DE STORAGE ---
  function isContextValid() {
    return Boolean(
      typeof chrome !== "undefined" &&
      chrome.runtime?.id &&
      chrome.storage?.local,
    );
  }

  function stopIfInvalid() {
    if (isContextValid()) return false;
    if (state.timerId) clearInterval(state.timerId);
    return true;
  }

  function enqueueStorage(fn) {
    if (stopIfInvalid()) return saveQueue;
    saveQueue = saveQueue.then(fn).catch((err) => {
      if (
        String(err?.message || err)
          .toLowerCase()
          .includes("context invalidated")
      ) {
        if (state.timerId) clearInterval(state.timerId);
        return;
      }
      console.error("[YT Recap] Error de almacenamiento:", err);
    });
    return saveQueue;
  }

  // --- EXTRACCIÓN DE METADATOS ---
  function extractVideoId() {
    const vParam = new URLSearchParams(location.search).get("v");
    if (vParam) return vParam;
    const match = location.pathname.match(
      /^\/(?:shorts|live|embed)\/([^/?#]+)/,
    );
    if (match) return match[1];
    const playerLink = document.querySelector(
      'a.ytp-title-link[href*="v="]',
    )?.href;
    if (playerLink) {
      try {
        return new URL(playerLink).searchParams.get("v") || "";
      } catch {
        return "";
      }
    }
    return "";
  }

  function detectContentType() {
    if (location.pathname.startsWith("/shorts/")) return "short";
    const liveBadge = document.querySelector(".ytp-live-badge");
    const isLiveDom = Boolean(
      liveBadge && liveBadge.offsetParent !== null && !liveBadge.disabled,
    );
    if (location.pathname.startsWith("/live/") || isLiveDom) return "live";
    return isMusic ? "music" : "video";
  }

  function detectPlaybackContext() {
    const listId = new URLSearchParams(location.search).get("list") || "";
    if (!listId) return { context: "direct", playlistId: "" };
    if (listId.startsWith("RD")) return { context: "mix", playlistId: listId };
    return { context: "playlist", playlistId: listId };
  }

  function buildVideoUrl(videoId, contentType) {
    if (!videoId) return location.href;
    if (contentType === "short")
      return `https://www.youtube.com/shorts/${videoId}`;
    if (isMusic) return `https://music.youtube.com/watch?v=${videoId}`;
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  function resolveVideoCategory(videoId) {
    if (isMusic) return "Music";
    if (!videoId) return "";
    if (categoryCache.has(videoId)) return categoryCache.get(videoId);

    const micro = document.querySelector(
      "#microformat, ytd-player-microformat-renderer",
    );
    if (micro) {
      const microId =
        micro
          .querySelector('meta[itemprop="identifier"]')
          ?.getAttribute("content") || "";
      const microUrl =
        micro.querySelector('link[itemprop="url"]')?.getAttribute("href") ||
        micro
          .querySelector('meta[itemprop="embedUrl"]')
          ?.getAttribute("content") ||
        "";
      const microGenre =
        micro
          .querySelector('meta[itemprop="genre"]')
          ?.getAttribute("content") || "";

      if (
        microGenre &&
        ((microId && microId === videoId) || microUrl.includes(videoId))
      ) {
        categoryCache.set(videoId, microGenre);
        return microGenre;
      }
    }

    if (!fetchingCategories.has(videoId)) {
      fetchingCategories.add(videoId);
      fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
        credentials: "omit",
      })
        .then((r) => (r.ok ? r.text() : ""))
        .then((html) => {
          const match = html.match(/"category"\s*:\s*"([^"]+)"/);
          if (!match?.[1]) return;
          const cat = match[1].replace(/\\u0026/g, "&");
          categoryCache.set(videoId, cat);
          if (state.session?.videoId === videoId) {
            state.session.category = cat;
            upsertSession(state.session, true);
          }
        })
        .catch(() => {})
        .finally(() => fetchingCategories.delete(videoId));
    }

    return "";
  }

  function getActiveVideo() {
    const all = [...document.querySelectorAll("video")];
    const playing = all.find((v) => !v.paused && !v.ended && v.readyState >= 2);
    return (
      playing ||
      document.querySelector("#movie_player video.html5-main-video") ||
      all[0] ||
      null
    );
  }

  function bindVideoListeners(video) {
    if (!video || boundVideos.has(video)) return;
    boundVideos.add(video);
    const sync = () => {
      if (stopIfInvalid()) return;
      const info = getTrackInfo();
      if (info) publishNowPlaying(video, info);
    };
    ["play", "pause", "ended", "ratechange", "volumechange"].forEach((evt) => {
      video.addEventListener(evt, sync, { passive: true });
    });
  }

  function getTrackInfo() {
    if (document.querySelector("#movie_player.ad-showing")) return null;

    const videoId = extractVideoId();
    const contentType = detectContentType();
    const { context, playlistId } = detectPlaybackContext();
    const category = resolveVideoCategory(videoId);

    const meta = navigator.mediaSession?.metadata;
    const metaTitle = meta?.title?.trim() || "";
    const metaArtist = meta?.artist?.trim() || "";
    const album = meta?.album?.trim() || "";
    let artwork = meta?.artwork?.[meta.artwork.length - 1]?.src || "";

    let domTitle = "";
    let domArtist = "";
    let channelUrl = "";

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
      channelUrl =
        document.querySelector("ytmusic-player-bar .byline a")?.href || "";
    } else {
      domTitle =
        document
          .querySelector(
            "h1.ytd-watch-metadata, #title h1, ytd-reel-video-renderer[is-active] h2",
          )
          ?.textContent?.trim() || "";
      const channelEl = document.querySelector(
        "ytd-watch-metadata #channel-name a, #upload-info #channel-name a, ytd-channel-name a, ytd-reel-video-renderer[is-active] #channel-name a",
      );
      domArtist = channelEl?.textContent?.trim() || "";
      channelUrl = channelEl?.href || "";
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

    return {
      trackKey,
      videoId,
      videoUrl: buildVideoUrl(videoId, contentType),
      title,
      artist,
      album,
      category,
      artwork,
      channelUrl,
      contentType,
      context,
      playlistId,
      source,
    };
  }

  // --- BÚSQUEDAS ---
  function handleSearchTracking() {
    const query =
      !isMusic && location.pathname === "/results"
        ? new URLSearchParams(location.search).get("search_query")?.trim()
        : isMusic && location.pathname === "/search"
          ? new URLSearchParams(location.search).get("q")?.trim()
          : "";

    if (!query) {
      state.activeSearchKey = null;
      return;
    }

    const key = `${source}::${query.toLowerCase()}`;
    if (state.activeSearchKey === key) return;
    state.activeSearchKey = key;

    const entry = {
      id: `sr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      query,
      normalized: query.toLowerCase(),
      url: location.href,
      source,
      timestamp: Date.now(),
    };

    enqueueStorage(async () => {
      if (stopIfInvalid()) return;
      const data = await chrome.storage.local.get({ searches: [] });
      const searches = Array.isArray(data.searches) ? data.searches : [];
      const lastSame = [...searches]
        .reverse()
        .find(
          (s) => s.normalized === entry.normalized && s.source === entry.source,
        );
      if (lastSame && entry.timestamp - lastSame.timestamp < 15000) return;
      searches.push(entry);
      if (searches.length > CONFIG.MAX_SEARCHES) {
        searches.splice(0, searches.length - CONFIG.MAX_SEARCHES);
      }
      await chrome.storage.local.set({ searches });
    });
  }

  // --- INTERACCIONES (ME GUSTA Y SUSCRIPCIONES) ---
  function isLikeActive(btn) {
    if (!btn) return false;
    if (btn.getAttribute("aria-pressed") === "true") return true;
    return (
      btn
        .closest("ytmusic-like-button-renderer")
        ?.getAttribute("like-status") === "LIKE"
    );
  }

  function isSubscribeActive(btn) {
    if (!btn) return false;
    const container = btn.closest(
      "ytd-subscribe-button-renderer, yt-subscribe-button-view-model, #subscribe-button",
    );
    if (container?.hasAttribute("subscribed")) return true;
    const txt = (btn.textContent || "").trim().toLowerCase();
    const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
    return (
      /^(suscrito|suscripto|subscribed)$/i.test(txt) ||
      aria.includes("cancelar suscrip") ||
      aria.includes("anular suscrip") ||
      aria.includes("unsubscribe")
    );
  }

  function saveInteraction(entry) {
    if (stopIfInvalid() || !entry) return;
    enqueueStorage(async () => {
      if (stopIfInvalid()) return;
      const data = await chrome.storage.local.get({ interactions: [] });
      const interactions = Array.isArray(data.interactions)
        ? data.interactions
        : [];
      const recentDup = interactions.find(
        (it) =>
          it.type === entry.type &&
          it.targetKey === entry.targetKey &&
          entry.timestamp - it.timestamp < 120000,
      );
      if (recentDup) return;
      interactions.push(entry);
      await chrome.storage.local.set({ interactions });
    });
  }

  document.addEventListener(
    "click",
    (e) => {
      if (stopIfInvalid()) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      const likeBtn = target.closest(
        "like-button-view-model button, ytd-toggle-button-renderer#like-button button, #like-button button, ytmusic-like-button-renderer #button-shape-like button, ytmusic-like-button-renderer tp-yt-paper-icon-button.like",
      );
      if (likeBtn) {
        const wasLiked = isLikeActive(likeBtn);
        setTimeout(() => {
          if (stopIfInvalid() || wasLiked || !isLikeActive(likeBtn)) return;
          const info = getTrackInfo();
          if (!info) return;
          saveInteraction({
            id: `lk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: "like",
            targetKey: info.videoId || info.trackKey,
            videoId: info.videoId || "",
            videoUrl: info.videoUrl || location.href,
            title: info.title,
            artist: info.artist,
            artwork: info.artwork,
            category: info.category || "",
            source,
            timestamp: Date.now(),
          });
        }, 450);
      }

      const subBtn = target.closest(
        "ytd-subscribe-button-renderer button, yt-subscribe-button-view-model button, #subscribe-button button, ytmusic-subscribe-button-renderer button",
      );
      if (subBtn) {
        const wasSub = isSubscribeActive(subBtn);
        setTimeout(() => {
          if (stopIfInvalid() || wasSub || !isSubscribeActive(subBtn)) return;
          const basePath = getChannelBasePath();
          const chInfo = basePath ? getChannelPageInfo(basePath) : null;
          const trackInfo = chInfo ? null : getTrackInfo();

          const name = chInfo?.name || trackInfo?.artist || "Canal de YouTube";
          const avatar = chInfo?.avatar || trackInfo?.artwork || "";
          const url = chInfo?.url || trackInfo?.channelUrl || "";

          saveInteraction({
            id: `sb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: "subscribe",
            targetKey: (url || name).toLowerCase(),
            title: name,
            artist: isMusic ? "YT Music" : "YouTube",
            artwork: avatar,
            channelUrl: url,
            source,
            timestamp: Date.now(),
          });
        }, 550);
      }
    },
    true,
  );

  // --- CANALES ---
  function getChannelBasePath() {
    const match = location.pathname.match(
      /^\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)/i,
    );
    if (!match) return null;
    if (isMusic && !match[1].toLowerCase().startsWith("channel/")) return null;
    return `/${match[1]}`;
  }

  function findVisible(root, selectors, attr) {
    for (const sel of selectors) {
      const visible = [...root.querySelectorAll(sel)].find(
        (el) =>
          !el.closest("[hidden]") && (attr ? el[attr] : el.textContent?.trim()),
      );
      if (visible) {
        return attr
          ? visible[attr]
          : visible.textContent.replace(/\s+/g, " ").trim();
      }
    }
    return "";
  }

  function getChannelPageInfo(basePath) {
    const scope = isMusic
      ? document.querySelector("ytmusic-browse-response") || document
      : document.querySelector(
          'ytd-browse[page-subtype="channels"]:not([hidden])',
        ) || document;

    const nameSelectors = isMusic
      ? [
          "ytmusic-immersive-header-renderer .title",
          "ytmusic-visual-header-renderer .title",
          "h1",
        ]
      : [
          "yt-page-header-renderer h1",
          "yt-dynamic-text-view-model h1",
          "#channel-header #text",
          "ytd-channel-name#channel-name #text",
          "#channel-name #text",
        ];

    const avatarSelectors = isMusic
      ? [
          "ytmusic-immersive-header-renderer img",
          "ytmusic-visual-header-renderer img",
        ]
      : [
          "yt-page-header-renderer img",
          "yt-avatar-shape img",
          "#channel-header #avatar img",
          "#channel-header img",
        ];

    const domName = findVisible(scope, nameSelectors);
    const avatar = findVisible(scope, avatarSelectors, "src");
    const handleFallback = basePath.startsWith("/@") ? basePath.slice(1) : "";

    return {
      domName,
      name: domName || handleFallback || "Canal de YouTube",
      avatar,
      url: `${location.origin}${basePath}`,
    };
  }

  function saveChannelVisit(visit, isUpdate = false) {
    if (stopIfInvalid()) return;
    enqueueStorage(async () => {
      if (stopIfInvalid()) return;
      const data = await chrome.storage.local.get({ channelVisits: [] });
      const visits = Array.isArray(data.channelVisits)
        ? data.channelVisits
        : [];
      const idx = visits.findIndex((v) => v.id === visit.id);
      if (idx >= 0) {
        visits[idx] = {
          ...visits[idx],
          name: visit.name,
          avatar: visit.avatar,
        };
      } else if (!isUpdate) {
        visits.push({
          id: visit.id,
          channelKey: visit.basePath.toLowerCase(),
          name: visit.name,
          avatar: visit.avatar,
          url: visit.url,
          source,
          timestamp: visit.timestamp,
        });
      }
      await chrome.storage.local.set({ channelVisits: visits });
    });
  }

  function handleChannelTracking() {
    const basePath = getChannelBasePath();
    if (!basePath) {
      state.channelVisit = null;
      state.pendingChannel = null;
      return;
    }

    const normPath = basePath.toLowerCase();
    if (state.channelVisit?.normPath === normPath) {
      if (state.channelVisit.ticks < 6) {
        state.channelVisit.ticks += 1;
        const info = getChannelPageInfo(basePath);
        if (
          (info.domName && info.domName !== state.channelVisit.name) ||
          (info.avatar && !state.channelVisit.avatar)
        ) {
          if (info.domName) state.channelVisit.name = info.domName;
          if (info.avatar) state.channelVisit.avatar = info.avatar;
          saveChannelVisit(state.channelVisit, true);
        }
      }
      return;
    }

    if (!state.pendingChannel || state.pendingChannel.normPath !== normPath) {
      state.pendingChannel = { normPath, basePath, ticks: 0 };
    } else {
      state.pendingChannel.ticks += 1;
    }

    const info = getChannelPageInfo(basePath);
    if (!info.domName && state.pendingChannel.ticks < 2) return;

    state.channelVisit = {
      id: `ch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      normPath,
      basePath,
      name: info.name,
      avatar: info.avatar,
      url: info.url,
      timestamp: Date.now(),
      ticks: 0,
    };
    state.pendingChannel = null;
    saveChannelVisit(state.channelVisit, false);
  }

  // --- SESIONES DE REPRODUCCIÓN ---
  function createSession(info, video, isLoop = false) {
    const dur = Number.isFinite(video.duration)
      ? Math.round(video.duration)
      : 0;
    let minRequired = CONFIG.MIN_SECONDS_TO_COUNT;
    if (isLoop) {
      minRequired = CONFIG.MIN_SECONDS_ON_LOOP;
    } else if (dur > 0 && dur < CONFIG.MIN_SECONDS_TO_COUNT) {
      minRequired = Math.max(5, Math.floor(dur * 0.8));
    }

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...info,
      duration: dur,
      seconds: 0,
      mutedSeconds: 0,
      rateSum: 0,
      rateCount: 0,
      minRequired,
      isLoop,
      maxTimeReached: video.currentTime || 0,
      lastSavedSeconds: -10,
      startedAt: Date.now(),
    };
  }

  function recordSkip(session) {
    if (stopIfInvalid() || !session || session.isLoop) return;
    if (session.seconds < 2 || session.seconds >= session.minRequired) return;

    const skipEntry = {
      id: `sk-${session.id}`,
      trackKey: session.trackKey,
      videoId: session.videoId || "",
      videoUrl: session.videoUrl || "",
      title: session.title,
      artist: session.artist,
      artwork: session.artwork,
      source: session.source,
      contentType: session.contentType,
      seconds: Math.round(session.seconds),
      duration: session.duration || 0,
      timestamp: session.startedAt,
    };

    enqueueStorage(async () => {
      if (stopIfInvalid()) return;
      const data = await chrome.storage.local.get({ skips: [] });
      const skips = Array.isArray(data.skips) ? data.skips : [];
      skips.push(skipEntry);
      if (skips.length > CONFIG.MAX_SKIPS) {
        skips.splice(0, skips.length - CONFIG.MAX_SKIPS);
      }
      await chrome.storage.local.set({ skips });
    });
  }

  function upsertSession(session, force = false) {
    if (stopIfInvalid() || !session || session.seconds < session.minRequired)
      return;
    if (
      !force &&
      session.seconds - session.lastSavedSeconds < CONFIG.SAVE_INTERVAL_SEC
    )
      return;

    const avgRate =
      session.rateCount > 0
        ? Number((session.rateSum / session.rateCount).toFixed(2))
        : 1;
    const mostlyMuted = session.mutedSeconds > session.seconds * 0.5;
    const completionPct =
      session.duration > 0
        ? Math.min(100, Math.round((session.seconds / session.duration) * 100))
        : null;

    const snapshot = {
      id: session.id,
      trackKey: session.trackKey,
      videoId: session.videoId || "",
      videoUrl: session.videoUrl || "",
      title: session.title,
      artist: session.artist,
      album: session.album || "",
      category: session.category || "",
      artwork: session.artwork,
      channelUrl: session.channelUrl || "",
      source: session.source,
      contentType: session.contentType || "video",
      context: session.context || "direct",
      playlistId: session.playlistId || "",
      duration: session.duration || 0,
      completionPct,
      playbackRate: avgRate,
      mostlyMuted,
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
      if (idx >= 0) history[idx] = snapshot;
      else history.push(snapshot);
      await chrome.storage.local.set({ history });
    });
  }

  function finalizeSession(session) {
    if (!session) return;
    if (session.seconds >= session.minRequired) upsertSession(session, true);
    else recordSkip(session);
  }

  async function publishNowPlaying(video, info) {
    if (stopIfInvalid() || !video || !info) return;

    try {
      const isPaused = Boolean(video.paused || video.ended);
      if (isPaused && state.lastPausedReported === true) return;

      state.lastPausedReported = isPaused;
      const dur = Number.isFinite(video.duration) ? video.duration : 0;

      await chrome.storage.local.set({
        [npStorageKey]: {
          tabInstanceId,
          title: info.title,
          artist: info.artist,
          album: info.album || "",
          category: state.session?.category || info.category || "",
          artwork: info.artwork,
          videoUrl: info.videoUrl,
          source: info.source,
          contentType: info.contentType,
          context: info.context,
          currentTime: Math.floor(video.currentTime || 0),
          duration: Math.floor(dur),
          paused: isPaused,
          visible: document.visibilityState === "visible",
          muted: Boolean(video.muted || video.volume === 0),
          playbackRate: Number((video.playbackRate || 1).toFixed(2)),
          loopActive: Boolean(video.loop),
          sessionSeconds: state.session ? state.session.seconds : 0,
          minRequired: state.session
            ? state.session.minRequired
            : CONFIG.MIN_SECONDS_TO_COUNT,
          isLoopSession: state.session ? state.session.isLoop : false,
          updatedAt: Date.now(),
        },
      });
    } catch (err) {
      if (
        String(err?.message || err)
          .toLowerCase()
          .includes("context invalidated")
      ) {
        if (state.timerId) clearInterval(state.timerId);
      }
    }
  }

  state.timerId = setInterval(() => {
    if (stopIfInvalid()) return;

    handleChannelTracking();
    handleSearchTracking();

    const video = getActiveVideo();
    if (video) bindVideoListeners(video);

    const info = getTrackInfo();
    if (!video || !info) return;

    if (video.paused || video.ended || video.readyState < 2) {
      publishNowPlaying(video, info);
      return;
    }

    if (state.session && state.session.trackKey !== info.trackKey) {
      finalizeSession(state.session);
      state.session = null;
    }

    if (!state.session) {
      state.session = createSession(info, video, false);
    } else {
      const s = state.session;
      if (info.artist && info.artist !== "YouTube" && s.artist !== info.artist)
        s.artist = info.artist;
      if (info.album && !s.album) s.album = info.album;
      if (info.category && !s.category) s.category = info.category;
      if (info.channelUrl && !s.channelUrl) s.channelUrl = info.channelUrl;
      if (info.artwork && !s.artwork) s.artwork = info.artwork;
      if (info.videoId && !s.videoId) {
        s.videoId = info.videoId;
        s.videoUrl = info.videoUrl;
      }

      const dur = Number.isFinite(video.duration) ? video.duration : 0;
      if (dur > 0 && !s.duration) s.duration = Math.round(dur);

      const nearEnd = dur > 0 && s.maxTimeReached >= Math.max(5, dur - 8);
      const restarted = s.maxTimeReached > 8 && video.currentTime < 5;

      if (restarted && (video.loop || nearEnd || s.seconds >= s.minRequired)) {
        const isActualLoop = Boolean(video.loop || nearEnd);
        finalizeSession(s);
        state.session = createSession(info, video, isActualLoop);
      } else {
        s.seconds += 1;
        if (video.muted || video.volume === 0) s.mutedSeconds += 1;
        s.rateSum += video.playbackRate || 1;
        s.rateCount += 1;
        if (video.currentTime > s.maxTimeReached)
          s.maxTimeReached = video.currentTime;
        upsertSession(s, s.seconds === s.minRequired);
      }
    }

    publishNowPlaying(video, info);
  }, CONFIG.TICK_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && state.session) {
      upsertSession(state.session, true);
    }
    const video = getActiveVideo();
    const info = getTrackInfo();
    if (video && info) {
      state.lastPausedReported = null;
      publishNowPlaying(video, info);
    }
  });

  window.addEventListener("pagehide", async () => {
    if (state.session) {
      finalizeSession(state.session);
      state.session = null;
    }
    if (isContextValid()) {
      try {
        await chrome.storage.local.remove(npStorageKey);
      } catch {
        // Ignorar al cerrar pestaña
      }
    }
  });
})();
