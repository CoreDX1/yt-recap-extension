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

  let currentChannelVisit = null;
  let pendingChannel = null;
  let activeSearchKey = null;

  const categoryCache = new Map();
  const fetchingCategories = new Set();

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
        micro
          .querySelector('link[itemprop="url"], meta[itemprop="embedUrl"]')
          ?.getAttribute("href") ||
        micro
          .querySelector('meta[itemprop="embedUrl"]')
          ?.getAttribute("content") ||
        "";
      const microGenre =
        micro
          .querySelector('meta[itemprop="genre"]')
          ?.getAttribute("content") || "";

      const matchesCurrent =
        (microId && microId === videoId) ||
        (microUrl && microUrl.includes(videoId));
      if (microGenre && matchesCurrent) {
        categoryCache.set(videoId, microGenre);
        return microGenre;
      }
    }

    // Si navegamos en SPA y el microformat aún está viejo, consultarlo una vez para ese videoId
    if (!fetchingCategories.has(videoId)) {
      fetchingCategories.add(videoId);
      fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
        credentials: "omit",
      })
        .then((r) => (r.ok ? r.text() : ""))
        .then((html) => {
          if (!html) return;
          const m = html.match(/"category"\s*:\s*"([^"]+)"/);
          if (m && m[1]) {
            const cat = m[1].replace(/\\u0026/g, "&");
            categoryCache.set(videoId, cat);
            if (currentSession && currentSession.videoId === videoId) {
              currentSession.category = cat;
              upsertSession(currentSession, true);
            }
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
      const artistLink = document.querySelector("ytmusic-player-bar .byline a");
      if (artistLink?.href) channelUrl = artistLink.href;
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
      if (channelEl?.href) channelUrl = channelEl.href;
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
    let query = "";
    if (!isMusic && location.pathname === "/results") {
      query =
        new URLSearchParams(location.search).get("search_query")?.trim() || "";
    } else if (isMusic && location.pathname === "/search") {
      query = new URLSearchParams(location.search).get("q")?.trim() || "";
    }

    if (!query) {
      activeSearchKey = null;
      return;
    }

    const key = `${source}::${query.toLowerCase()}`;
    if (activeSearchKey === key) return;
    activeSearchKey = key;

    const searchEntry = {
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
          (s) =>
            s.normalized === searchEntry.normalized &&
            s.source === searchEntry.source,
        );
      if (lastSame && searchEntry.timestamp - lastSame.timestamp < 15000)
        return;
      searches.push(searchEntry);
      if (searches.length > 2000) searches.splice(0, searches.length - 2000);
      await chrome.storage.local.set({ searches });
    });
  }

  // --- INTERACCIONES (ME GUSTA Y SUSCRIPCIONES) ---
  function isLikeActive(btn) {
    if (!btn) return false;
    if (btn.getAttribute("aria-pressed") === "true") return true;
    const ytmRenderer = btn.closest("ytmusic-like-button-renderer");
    return ytmRenderer?.getAttribute("like-status") === "LIKE";
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
      // Evitar duplicados si tocó Like/Unlike/Like en menos de 2 minutos
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

      // 1. Detectar Me gusta
      const likeBtn = target.closest(
        "like-button-view-model button, ytd-toggle-button-renderer#like-button button, #like-button button, ytmusic-like-button-renderer #button-shape-like button, ytmusic-like-button-renderer tp-yt-paper-icon-button.like",
      );
      if (likeBtn) {
        const wasLiked = isLikeActive(likeBtn);
        setTimeout(() => {
          if (stopIfInvalid()) return;
          if (!wasLiked && isLikeActive(likeBtn)) {
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
          }
        }, 450);
      }

      // 2. Detectar Suscripción nueva
      const subBtn = target.closest(
        "ytd-subscribe-button-renderer button, yt-subscribe-button-view-model button, #subscribe-button button, ytmusic-subscribe-button-renderer button",
      );
      if (subBtn) {
        const wasSub = isSubscribeActive(subBtn);
        setTimeout(() => {
          if (stopIfInvalid()) return;
          if (!wasSub && isSubscribeActive(subBtn)) {
            const basePath = getChannelBasePath();
            let name = "";
            let avatar = "";
            let url = "";

            if (basePath) {
              const chInfo = getChannelPageInfo(basePath);
              name = chInfo.name;
              avatar = chInfo.avatar;
              url = chInfo.url;
            } else {
              const info = getTrackInfo();
              name = info?.artist || "Canal de YouTube";
              avatar = info?.artwork || "";
              url = info?.channelUrl || "";
            }

            saveInteraction({
              id: `sb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: "subscribe",
              targetKey: (url || name).toLowerCase(),
              title: name,
              artist: source === "yt_music" ? "YT Music" : "YouTube",
              artwork: avatar,
              channelUrl: url,
              source,
              timestamp: Date.now(),
            });
          }
        }, 550);
      }
    },
    true,
  );

  // --- DETECCIÓN DE PÁGINAS DE CANAL ---
  function getChannelBasePath() {
    const match = location.pathname.match(
      /^\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)/i,
    );
    if (!match) return null;
    if (isMusic && !match[1].toLowerCase().startsWith("channel/")) return null;
    return `/${match[1]}`;
  }

  function findVisibleText(root, selectors) {
    for (const sel of selectors) {
      const els = [...root.querySelectorAll(sel)];
      const visible = els.find(
        (el) => !el.closest("[hidden]") && el.textContent?.trim(),
      );
      if (visible) return visible.textContent.replace(/\s+/g, " ").trim();
    }
    return "";
  }

  function findVisibleImg(root, selectors) {
    for (const sel of selectors) {
      const els = [...root.querySelectorAll(sel)];
      const visible = els.find((el) => !el.closest("[hidden]") && el.src);
      if (visible) return visible.src;
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

    const domName = findVisibleText(scope, nameSelectors);
    const avatar = findVisibleImg(scope, avatarSelectors);
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
      currentChannelVisit = null;
      pendingChannel = null;
      return;
    }

    const normPath = basePath.toLowerCase();

    if (currentChannelVisit && currentChannelVisit.normPath === normPath) {
      if (currentChannelVisit.ticks < 6) {
        currentChannelVisit.ticks += 1;
        const info = getChannelPageInfo(basePath);
        const changedName =
          info.domName && info.domName !== currentChannelVisit.name;
        const gainedAvatar = info.avatar && !currentChannelVisit.avatar;
        if (changedName || gainedAvatar) {
          if (info.domName) currentChannelVisit.name = info.domName;
          if (info.avatar) currentChannelVisit.avatar = info.avatar;
          saveChannelVisit(currentChannelVisit, true);
        }
      }
      return;
    }

    if (!pendingChannel || pendingChannel.normPath !== normPath) {
      pendingChannel = { normPath, basePath, ticks: 0 };
    } else {
      pendingChannel.ticks += 1;
    }

    const info = getChannelPageInfo(basePath);
    if (!info.domName && pendingChannel.ticks < 2) return;

    const visit = {
      id: `ch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      normPath,
      basePath,
      name: info.name,
      avatar: info.avatar,
      url: info.url,
      timestamp: Date.now(),
      ticks: 0,
    };

    currentChannelVisit = visit;
    pendingChannel = null;
    saveChannelVisit(visit, false);
  }

  // --- SESIONES DE REPRODUCCIÓN Y SKIPS ---
  function createSession(info, video, isLoop = false) {
    const dur = Number.isFinite(video.duration)
      ? Math.round(video.duration)
      : 0;
    let minRequired = MIN_SECONDS_TO_COUNT;
    if (isLoop) {
      minRequired = MIN_SECONDS_ON_LOOP;
    } else if (dur > 0 && dur < MIN_SECONDS_TO_COUNT) {
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
    if (stopIfInvalid() || !session) return;
    if (
      session.isLoop ||
      session.seconds < 2 ||
      session.seconds >= session.minRequired
    )
      return;

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
      if (skips.length > 1000) skips.splice(0, skips.length - 1000);
      await chrome.storage.local.set({ skips });
    });
  }

  function upsertSession(session, force = false) {
    if (stopIfInvalid() || !session) return;
    if (session.seconds < session.minRequired) return;
    if (!force && session.seconds - session.lastSavedSeconds < 5) return;

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
      if (idx >= 0) {
        history[idx] = snapshot;
      } else {
        history.push(snapshot);
      }
      await chrome.storage.local.set({ history });
    });
  }

  function finalizeSession(session) {
    if (!session) return;
    if (session.seconds >= session.minRequired) {
      upsertSession(session, true);
    } else {
      recordSkip(session);
    }
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
          album: info.album || "",
          category: currentSession?.category || info.category || "",
          artwork: info.artwork,
          videoUrl: info.videoUrl,
          source: info.source,
          contentType: info.contentType,
          context: info.context,
          currentTime: Math.floor(video.currentTime || 0),
          duration: Math.floor(dur),
          paused: isPaused,
          muted: Boolean(video.muted || video.volume === 0),
          playbackRate: Number((video.playbackRate || 1).toFixed(2)),
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

    handleChannelTracking();
    handleSearchTracking();

    const video = getActiveVideo();
    const info = getTrackInfo();
    if (!video || !info) return;

    if (video.paused || video.ended || video.readyState < 2) {
      publishNowPlaying(video, info);
      return;
    }

    if (currentSession && currentSession.trackKey !== info.trackKey) {
      finalizeSession(currentSession);
      currentSession = null;
    }

    if (!currentSession) {
      currentSession = createSession(info, video, false);
    } else {
      if (
        info.artist &&
        info.artist !== "YouTube" &&
        currentSession.artist !== info.artist
      ) {
        currentSession.artist = info.artist;
      }
      if (info.album && !currentSession.album)
        currentSession.album = info.album;
      if (info.category && !currentSession.category)
        currentSession.category = info.category;
      if (info.channelUrl && !currentSession.channelUrl)
        currentSession.channelUrl = info.channelUrl;
      if (info.artwork && !currentSession.artwork)
        currentSession.artwork = info.artwork;
      if (info.videoId && !currentSession.videoId) {
        currentSession.videoId = info.videoId;
        currentSession.videoUrl = info.videoUrl;
      }

      const dur = Number.isFinite(video.duration) ? video.duration : 0;
      if (dur > 0 && !currentSession.duration)
        currentSession.duration = Math.round(dur);

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
        finalizeSession(currentSession);
        currentSession = createSession(info, video, isActualLoop);
      } else {
        currentSession.seconds += 1;
        if (video.muted || video.volume === 0) currentSession.mutedSeconds += 1;
        currentSession.rateSum += video.playbackRate || 1;
        currentSession.rateCount += 1;

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
      finalizeSession(currentSession);
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
        // Ignorar
      }
    }
  });
})();
