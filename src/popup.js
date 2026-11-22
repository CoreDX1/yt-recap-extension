// src/popup.js — v2.5.1 (ajuste opcional del PATCH C: debounce mayor + skip si oculto)

import {
  translateCategory,
  toDateKey,
  resolveVideoUrl,
  openInstantPlaylist,
  formatClock,
  formatDuration,
  formatShortDateTime,
  matchesFilter,
  matchesPeriodAndSourceOnly,
  getGroupKey,
  sanitizeFileSlug,
  isMusicItem,
} from "./utils.js";
import {
  buildTrackRow,
  renderInteractionRow,
  renderSearchRow,
} from "./rows.js";
import { CALENDAR_MARKUP } from "./calendarMarkup.js";
import { bindCalendarControls } from "./calendarController.js";
import {
  loadStore,
  migrateMusicFlags,
  persistMusicFlags,
  downloadBlob,
  exportPngCard,
  buildExportZip,
  importFromFile,
  enrichImported,
  NowPlaying,
  emptyStore,
} from "./recapStore.js";
import { summaryVM, activityVM, channelsVM, likesVM } from "./viewModels.js";
import { renderCalendarView } from "./calendarView.js";

const urlParams = new URLSearchParams(location.search);
const isFullMode = urlParams.get("full") === "1";
if (isFullMode) {
  location.replace(chrome.runtime.getURL("full.html"));
  await new Promise(() => {});
}

document.getElementById("tab-calendar").innerHTML = CALENDAR_MARKUP;

const $ = (id) => document.getElementById(id);

const dom = {
  periodSelect: $("periodSelect"),
  sourceSelect: $("sourceSelect"),
  expandBtn: $("expandBtn"),
  importBtn: $("importBtn"),
  importInput: $("importInput"),
  exportBtn: $("exportBtn"),
  statusBanner: $("statusBanner"),
  clearBtn: $("clearBtn"),
  enrichMusicBtn: $("enrichMusicBtn"),
  confirmClearDialog: $("confirmClearDialog"),
  cancelClearBtn: $("cancelClearBtn"),
  confirmClearBtn: $("confirmClearBtn"),
  npEmpty: $("npEmpty"),
  npContent: $("npContent"),
  npThumb: $("npThumb"),
  npStatusBadge: $("npStatusBadge"),
  npSourceBadge: $("npSourceBadge"),
  npCategoryBadge: $("npCategoryBadge"),
  npFormatBadge: $("npFormatBadge"),
  npLoopBadge: $("npLoopBadge"),
  npTitle: $("npTitle"),
  npArtist: $("npArtist"),
  npBarFill: $("npBarFill"),
  npTime: $("npTime"),
  npCountState: $("npCountState"),
  npOtherWrap: $("npOtherWrap"),
  npOtherHeader: $("npOtherHeader"),
  npOtherList: $("npOtherList"),
  totalTime: $("totalTime"),
  totalPlays: $("totalPlays"),
  totalLoops: $("totalLoops"),
  uniqueCount: $("uniqueCount"),
  streakDays: $("streakDays"),
  peakHour: $("peakHour"),
  exportImgBtn: $("exportImgBtn"),
  makePlaylistBtn: $("makePlaylistBtn"),
  topList: $("topList"),
  emptyMsg: $("emptyMsg"),
  recentList: $("recentList"),
  recentEmpty: $("recentEmpty"),
  categoriesBox: $("categoriesBox"),
  categoriesList: $("categoriesList"),
  hoursChart: $("hoursChart"),
  breakdownStats: $("breakdownStats"),
  searchesBox: $("searchesBox"),
  topSearchesList: $("topSearchesList"),
  albumsBox: $("albumsBox"),
  topAlbumsList: $("topAlbumsList"),
  topArtistsList: $("topArtistsList"),
  skipsBox: $("skipsBox"),
  topSkipsList: $("topSkipsList"),
  calSearchInput: $("calSearchInput"),
  calSearchSummary: $("calSearchSummary"),
  calMonthView: $("calMonthView"),
  calYearView: $("calYearView"),
  calMonthLabel: $("calMonthLabel"),
  calPrevBtn: $("calPrevBtn"),
  calNextBtn: $("calNextBtn"),
  calTodayBtn: $("calTodayBtn"),
  calGrid: $("calGrid"),
  calMonthStatsBox: $("calMonthStatsBox"),
  calMonthStatsGrid: $("calMonthStatsGrid"),
  calMonthCompare: $("calMonthCompare"),
  calDayTitle: $("calDayTitle"),
  calDaySummary: $("calDaySummary"),
  calDayList: $("calDayList"),
  calDayEmpty: $("calDayEmpty"),
  calMonthTopTitle: $("calMonthTopTitle"),
  calMonthImgBtn: $("calMonthImgBtn"),
  calMonthPlaylistBtn: $("calMonthPlaylistBtn"),
  calMonthTopList: $("calMonthTopList"),
  calMonthTopEmpty: $("calMonthTopEmpty"),
  calMonthChannelsBox: $("calMonthChannelsBox"),
  calMonthChannelsTitle: $("calMonthChannelsTitle"),
  calMonthChannelsList: $("calMonthChannelsList"),
  calMonthCatsBox: $("calMonthCatsBox"),
  calMonthCatsTitle: $("calMonthCatsTitle"),
  calMonthCatsList: $("calMonthCatsList"),
  calWeekdayBox: $("calWeekdayBox"),
  calWeekdayChart: $("calWeekdayChart"),
  calMonthSocialBox: $("calMonthSocialBox"),
  calMonthSocialTitle: $("calMonthSocialTitle"),
  calMonthSocialList: $("calMonthSocialList"),
  calWeeksTitle: $("calWeeksTitle"),
  calWeeksList: $("calWeeksList"),
  calYearLabel: $("calYearLabel"),
  calYearPrevBtn: $("calYearPrevBtn"),
  calYearNextBtn: $("calYearNextBtn"),
  calYearStats: $("calYearStats"),
  calYearHeatmapScroll: $("calYearHeatmapScroll"),
  calYearGrid: $("calYearGrid"),
  calYearMonthsGrid: $("calYearMonthsGrid"),
  chUniqueCount: $("chUniqueCount"),
  chTotalVisits: $("chTotalVisits"),
  chNewSubs: $("chNewSubs"),
  channelsDurationList: $("channelsDurationList"),
  channelsDurationEmpty: $("channelsDurationEmpty"),
  channelsTopList: $("channelsTopList"),
  channelsEmpty: $("channelsEmpty"),
  channelsRecentList: $("channelsRecentList"),
  channelsRecentEmpty: $("channelsRecentEmpty"),
  lkTotalLikes: $("lkTotalLikes"),
  lkTotalSubs: $("lkTotalSubs"),
  lkTotalSearches: $("lkTotalSearches"),
  likesList: $("likesList"),
  likesEmpty: $("likesEmpty"),
  subsList: $("subsList"),
  subsEmpty: $("subsEmpty"),
  socialSearchesList: $("socialSearchesList"),
  socialSearchesEmpty: $("socialSearchesEmpty"),
};

const nowInit = new Date();
const uiState = {
  activeTab: "summary",
  dirtyTabs: new Set([
    "summary",
    "recent",
    "activity",
    "calendar",
    "channels",
    "likes",
  ]),
  calViewMode: "month",
  calSearchQuery: "",
  calYear: nowInit.getFullYear(),
  calMonth: nowInit.getMonth(),
  selectedDateKey: toDateKey(nowInit),
  recentMode: "plays",
  calDayMode: "all",
  channelSort: "time",
  channelMinSec: 0,
  pinnedNpTabId: null,
  topVideoIds: [],
  monthTopVideoIds: [],
  summaryCardData: null,
  monthCardData: null,
};

const store = emptyStore();
const npService = new NowPlaying();

let statusTimer = null;
function showStatus(msg, isError = false) {
  dom.statusBanner.textContent = msg;
  dom.statusBanner.classList.toggle("error", isError);
  dom.statusBanner.hidden = false;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    dom.statusBanner.hidden = true;
  }, 6000);
}

function renderNowPlaying(np) {
  if (!np) {
    dom.npEmpty.hidden = false;
    dom.npContent.hidden = true;
    return;
  }
  dom.npEmpty.hidden = true;
  dom.npContent.hidden = false;
  if (np.artwork) dom.npThumb.src = np.artwork;
  else dom.npThumb.removeAttribute("src");
  dom.npStatusBadge.textContent = np.paused ? "⏸ En pausa" : "● En vivo";
  dom.npStatusBadge.classList.toggle("paused", np.paused);
  dom.npSourceBadge.textContent =
    np.source === "yt_music"
      ? "YT Music"
      : np.isMusic
        ? "YouTube · Música"
        : "YouTube";
  if (np.category) {
    dom.npCategoryBadge.textContent = translateCategory(np.category);
    dom.npCategoryBadge.hidden = false;
  } else {
    dom.npCategoryBadge.hidden = true;
  }
  const fmtLabels = { short: "Short", live: "En vivo", mix: "Mix" };
  const fmtText =
    fmtLabels[np.contentType] || (np.context === "mix" ? "Mix" : "");
  dom.npFormatBadge.hidden = !fmtText;
  if (fmtText) dom.npFormatBadge.textContent = fmtText;
  dom.npLoopBadge.hidden = !(np.loopActive || np.isLoopSession);
  dom.npTitle.textContent = np.title;
  dom.npArtist.textContent = np.album
    ? `${np.artist} · ${np.album}`
    : np.artist;
  const pct =
    np.duration > 0 ? Math.min(100, (np.currentTime / np.duration) * 100) : 0;
  dom.npBarFill.style.width = `${pct.toFixed(1)}%`;
  const extras = [];
  if (np.playbackRate && np.playbackRate !== 1)
    extras.push(`${np.playbackRate}x`);
  if (np.muted) extras.push("🔇");
  const clock =
    np.duration > 0
      ? `${formatClock(np.currentTime)} / ${formatClock(np.duration)}`
      : formatClock(np.currentTime);
  dom.npTime.textContent = extras.length
    ? `${clock} · ${extras.join(" ")}`
    : clock;
  const remaining = Math.max(
    0,
    (np.minRequired || 20) - (np.sessionSeconds || 0),
  );
  if (remaining === 0) {
    dom.npCountState.textContent = "✓ Registrado";
    dom.npCountState.classList.add("saved");
  } else {
    dom.npCountState.textContent = `Cuenta en ${remaining}s`;
    dom.npCountState.classList.remove("saved");
  }
}

function renderOtherOpenTabs(others) {
  if (others.length === 0) {
    dom.npOtherWrap.hidden = true;
    dom.npOtherList.replaceChildren();
    return;
  }
  dom.npOtherWrap.hidden = false;
  dom.npOtherHeader.textContent = `Otras pestañas abiertas (${others.length})`;
  dom.npOtherList.replaceChildren(
    ...others.map((tab) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "np-other-btn";
      btn.title = "Clic para ver en la tarjeta principal";
      const st = document.createElement("span");
      st.className = tab.paused ? "np-other-state" : "np-other-state playing";
      st.textContent = tab.paused ? "⏸" : "▶";
      const img = document.createElement("img");
      img.className = "np-other-thumb";
      if (tab.artwork) img.src = tab.artwork;
      img.alt = "";
      const meta = document.createElement("div");
      meta.className = "meta";
      const title = document.createElement("div");
      title.className = "np-other-title";
      title.textContent = tab.title;
      const srcLabel =
        tab.source === "yt_music"
          ? "YT Music"
          : tab.isMusic
            ? "YouTube · Música"
            : "YouTube";
      const sub = document.createElement("div");
      sub.className = "np-other-sub";
      sub.textContent = `${srcLabel} · ${tab.artist}`;
      meta.append(title, sub);
      const time = document.createElement("span");
      time.className = "np-other-time";
      time.textContent =
        tab.duration > 0
          ? `${formatClock(tab.currentTime)} / ${formatClock(tab.duration)}`
          : formatClock(tab.currentTime);
      const children = [st, img, meta, time];
      if (tab.tabId != null && npService.tabs.has(tab.tabId)) {
        const jumpBtn = document.createElement("span");
        jumpBtn.className = "np-other-time";
        jumpBtn.textContent = "↗";
        jumpBtn.title = "Ir a esta pestaña en Chrome";
        jumpBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const realTab = npService.tabs.get(tab.tabId);
          if (realTab) {
            chrome.tabs.update(realTab.id, { active: true });
            chrome.windows.update(realTab.windowId, { focused: true });
          }
        });
        children.push(jumpBtn);
      }
      btn.append(...children);
      btn.addEventListener("click", () => {
        uiState.pinnedNpTabId = tab.storageKey || tab.tabId;
        renderBestNowPlaying();
      });
      li.append(btn);
      return li;
    }),
  );
}

function renderBestNowPlaying() {
  const sel = npService.select(uiState.pinnedNpTabId);
  if (!sel) {
    uiState.pinnedNpTabId = null;
    renderNowPlaying(null);
    renderOtherOpenTabs([]);
    return;
  }
  renderNowPlaying(sel.primary);
  renderOtherOpenTabs(sel.others);
}

function getFilteredPlays(checkDate = true) {
  return store.history.filter((it) =>
    matchesFilter(
      it,
      dom.periodSelect.value,
      dom.sourceSelect.value,
      checkDate,
    ),
  );
}
function getFilteredMeta(items, checkDate = true) {
  return items.filter((it) =>
    matchesPeriodAndSourceOnly(
      it,
      dom.periodSelect.value,
      dom.sourceSelect.value,
      checkDate,
    ),
  );
}

function renderSummaryTab() {
  const vm = summaryVM(getFilteredPlays(true));
  if (vm.empty) {
    dom.totalTime.textContent = "0 min";
    dom.totalPlays.textContent = "0";
    dom.totalLoops.textContent = "🔁 0";
    dom.uniqueCount.textContent = "0";
    dom.streakDays.textContent = "0 días";
    dom.peakHour.textContent = "—";
    dom.exportImgBtn.hidden = true;
    dom.makePlaylistBtn.hidden = true;
    uiState.summaryCardData = null;
    dom.topList.replaceChildren();
    dom.emptyMsg.hidden = false;
    return;
  }
  dom.emptyMsg.hidden = true;
  uiState.topVideoIds = vm.topTracks
    .map((t) => t.videoId)
    .filter(Boolean)
    .slice(0, 20);
  dom.makePlaylistBtn.hidden = uiState.topVideoIds.length === 0;
  const periodLabel =
    dom.periodSelect.options[dom.periodSelect.selectedIndex]?.text ||
    "Mi Recap";
  uiState.summaryCardData = {
    subtitle: periodLabel.toUpperCase(),
    topTracks: vm.topTracks.slice(0, 5),
    totalSeconds: vm.totalSeconds,
    totalPlays: vm.totalPlays,
    totalLoops: vm.totalLoops,
    topArtist: vm.topArtist,
  };
  dom.exportImgBtn.hidden = vm.topTracks.length === 0;
  dom.totalTime.textContent = formatDuration(vm.totalSeconds);
  dom.totalPlays.textContent = String(vm.totalPlays);
  dom.totalLoops.textContent = `🔁 ${vm.totalLoops}`;
  dom.uniqueCount.textContent = String(vm.unique);
  dom.streakDays.textContent = `${vm.streak} ${vm.streak === 1 ? "día" : "días"}`;
  dom.peakHour.textContent = vm.peakLabel;
  dom.topList.replaceChildren(
    ...vm.topTracks.slice(0, 15).map((track, idx) => {
      const mins =
        track.seconds > 0
          ? `${Math.max(1, Math.round(track.seconds / 60))}m`
          : "Imp.";
      const avgPct =
        track.pctCount > 0
          ? ` · ${Math.round(track.pctSum / track.pctCount)}%`
          : "";
      const right =
        track.loops > 0
          ? `${track.plays}x (🔁${track.loops}) · ${mins}`
          : `${track.plays}x · ${mins}${avgPct}`;
      return buildTrackRow(
        String(idx + 1),
        track.artwork,
        track.title,
        track.artist,
        right,
        { href: track.videoUrl || undefined },
      );
    }),
  );
}

function renderRecentTab() {
  if (uiState.recentMode === "plays") {
    const filtered = getFilteredPlays(true);
    dom.recentEmpty.hidden = filtered.length > 0;
    if (filtered.length === 0) {
      dom.recentList.replaceChildren();
      return;
    }
    const items = [...filtered]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 30);
    dom.recentList.replaceChildren(
      ...items.map((item) => {
        const timeStr = new Date(item.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        const tags = [];
        if (item.isLoop) tags.push("🔁 Bucle");
        if (item.category) tags.push(translateCategory(item.category));
        if (item.isMusic && item.source === "youtube" && !item.category)
          tags.push("Música");
        if (item.contentType === "short") tags.push("Short");
        if (item.contentType === "live") tags.push("Live");
        if (item.playbackRate && item.playbackRate !== 1)
          tags.push(`${item.playbackRate}x`);
        if (item.mostlyMuted) tags.push("🔇");
        if (item.imported) tags.push("Takeout");
        const sub = `${item.artist} · ${timeStr}${tags.length ? " · " + tags.join(" · ") : ""}`;
        return buildTrackRow(
          item.isLoop ? "🔁" : "•",
          item.artwork,
          item.title,
          sub,
          item.seconds > 0 ? formatClock(item.seconds) : "—",
          { href: resolveVideoUrl(item) || undefined },
        );
      }),
    );
    return;
  }
  if (uiState.recentMode === "likes" || uiState.recentMode === "subs") {
    const type = uiState.recentMode === "likes" ? "like" : "subscribe";
    const items = getFilteredMeta(store.interactions, true)
      .filter((it) => it.type === type)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 30);
    dom.recentEmpty.hidden = items.length > 0;
    dom.recentList.replaceChildren(...items.map(renderInteractionRow));
    return;
  }
  const searches = getFilteredMeta(store.searches, true)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 30);
  dom.recentEmpty.hidden = searches.length > 0;
  dom.recentList.replaceChildren(...searches.map(renderSearchRow));
}

function renderActivityTab() {
  const vm = activityVM(
    getFilteredPlays(true),
    getFilteredMeta(store.interactions, true),
    getFilteredMeta(store.searches, true),
    store.skips.filter((it) =>
      matchesFilter(it, dom.periodSelect.value, dom.sourceSelect.value, true),
    ),
  );

  dom.categoriesBox.hidden = vm.catEntries.length === 0;
  dom.categoriesList.replaceChildren(
    ...vm.catEntries.map((st) => {
      const row = document.createElement("div");
      row.className = "cat-row";
      const top = document.createElement("div");
      top.className = "cat-row-top";
      const lbl = document.createElement("span");
      lbl.textContent = translateCategory(st.cat);
      const meta = document.createElement("span");
      meta.textContent = `${st.pct}% · ${st.plays}x (${formatDuration(st.seconds)})`;
      top.append(lbl, meta);
      const track = document.createElement("div");
      track.className = "cat-track";
      const fill = document.createElement("div");
      fill.className = "cat-fill";
      fill.style.width = `${st.pct}%`;
      track.append(fill);
      row.append(top, track);
      return row;
    }),
  );

  dom.hoursChart.replaceChildren(
    ...vm.hours.map((sec, h) => {
      const bar = document.createElement("div");
      bar.className = sec === 0 ? "hour-bar zero" : "hour-bar";
      const pct =
        vm.maxHour > 0 ? Math.max(5, Math.round((sec / vm.maxHour) * 100)) : 5;
      bar.style.height = sec === 0 ? "4px" : `${pct}%`;
      bar.title = `${String(h).padStart(2, "0")}:00 — ${formatDuration(sec)}`;
      return bar;
    }),
  );

  dom.breakdownStats.replaceChildren(
    ...vm.chips.map(([label, val]) => {
      const div = document.createElement("div");
      div.className = "bd-chip";
      const sp = document.createElement("span");
      sp.textContent = label;
      const st = document.createElement("strong");
      st.textContent = String(val);
      div.append(sp, st);
      return div;
    }),
  );

  dom.searchesBox.hidden = vm.topSearches.length === 0;
  dom.topSearchesList.replaceChildren(
    ...vm.topSearches.map((s, idx) =>
      buildTrackRow(
        String(idx + 1),
        "",
        s.query,
        s.source === "yt_music" ? "YT Music" : "YouTube",
        `${s.count}x`,
        { href: s.url || undefined, noThumb: true },
      ),
    ),
  );

  dom.albumsBox.hidden = vm.topAlbums.length === 0;
  dom.topAlbumsList.replaceChildren(
    ...vm.topAlbums.map((a, idx) =>
      buildTrackRow(
        String(idx + 1),
        a.artwork,
        a.album,
        a.artist,
        `${a.plays}x · ${formatDuration(a.seconds)}`,
      ),
    ),
  );

  dom.topArtistsList.replaceChildren(
    ...vm.topArtists.map((st, idx) =>
      buildTrackRow(
        String(idx + 1),
        st.artwork,
        st.name,
        `${st.plays} reproducciones`,
        formatDuration(st.seconds),
        { href: st.url || undefined },
      ),
    ),
  );

  dom.skipsBox.hidden = vm.topSkips.length === 0;
  dom.topSkipsList.replaceChildren(
    ...vm.topSkips.map((s, idx) =>
      buildTrackRow(
        String(idx + 1),
        s.artwork,
        s.title,
        s.artist,
        `${s.count} skips`,
        { href: s.videoUrl || undefined },
      ),
    ),
  );
}

function renderCalendarTab() {
  renderCalendarView({
    dom,
    uiState,
    getFilteredPlays,
    getFilteredMeta,
    store,
    buildTrackRow,
    renderInteractionRow,
    renderSearchRow,
    onExportPng: (cardData, btn) => exportPngCard(cardData, btn),
  });
}

function renderChannelsTab() {
  const vm = channelsVM(
    getFilteredMeta(store.channelVisits, true),
    getFilteredPlays(true),
    uiState.channelSort,
    uiState.channelMinSec,
  );
  const newSubsCount = getFilteredMeta(store.interactions, true).filter(
    (it) => it.type === "subscribe",
  ).length;
  dom.chUniqueCount.textContent = String(vm.unique);
  dom.chTotalVisits.textContent = String(vm.totalVisits);
  dom.chNewSubs.textContent = `🔔 ${newSubsCount}`;

  dom.channelsDurationEmpty.hidden = vm.withTime.length > 0;
  dom.channelsDurationList.replaceChildren(
    ...vm.withTime.map((ch, idx) =>
      buildTrackRow(
        String(idx + 1),
        ch.avatar,
        ch.name,
        `${ch.plays} rep. · ${ch.sharePct}% del tiempo`,
        formatDuration(ch.seconds),
        { href: ch.url || undefined, avatar: true, barPct: ch.barPct },
      ),
    ),
  );

  dom.channelsEmpty.hidden = vm.ranked.length > 0;
  dom.channelsTopList.replaceChildren(
    ...vm.ranked.map((ch, idx) =>
      buildTrackRow(
        String(idx + 1),
        ch.avatar,
        ch.name,
        ch.sub,
        ch.seconds > 0 ? formatDuration(ch.seconds) : `${ch.visits}x`,
        { href: ch.url || undefined, avatar: true, barPct: ch.barPct },
      ),
    ),
  );

  dom.channelsRecentEmpty.hidden = vm.recent.length > 0;
  dom.channelsRecentList.replaceChildren(
    ...vm.recent.map((v) =>
      buildTrackRow(
        "👁",
        v.avatar,
        v.name,
        `${v.source === "yt_music" ? "YT Music" : "YouTube"} · ${formatShortDateTime(v.timestamp)}`,
        "Abrir ↗",
        { href: v.url || undefined, avatar: true },
      ),
    ),
  );
}

function renderLikesTab() {
  const vm = likesVM(
    getFilteredMeta(store.interactions, true),
    getFilteredMeta(store.searches, true),
  );
  dom.lkTotalLikes.textContent = `❤️ ${vm.likes.length}`;
  dom.lkTotalSubs.textContent = `🔔 ${vm.subs.length}`;
  dom.lkTotalSearches.textContent = `🔍 ${vm.searches.length}`;
  dom.likesEmpty.hidden = vm.likes.length > 0;
  dom.likesList.replaceChildren(
    ...vm.likes.slice(0, 30).map(renderInteractionRow),
  );
  dom.subsEmpty.hidden = vm.subs.length > 0;
  dom.subsList.replaceChildren(
    ...vm.subs.slice(0, 30).map(renderInteractionRow),
  );
  dom.socialSearchesEmpty.hidden = vm.searches.length > 0;
  dom.socialSearchesList.replaceChildren(
    ...vm.searches.slice(0, 25).map(renderSearchRow),
  );
}

const TAB_RENDERERS = {
  summary: renderSummaryTab,
  recent: renderRecentTab,
  activity: renderActivityTab,
  calendar: renderCalendarTab,
  channels: renderChannelsTab,
  likes: renderLikesTab,
};

function renderActiveTab() {
  TAB_RENDERERS[uiState.activeTab]?.();
  uiState.dirtyTabs.delete(uiState.activeTab);
}
function invalidateAllTabs() {
  Object.keys(TAB_RENDERERS).forEach((t) => uiState.dirtyTabs.add(t));
  renderActiveTab();
}

dom.exportBtn.addEventListener("click", async () => {
  const orig = dom.exportBtn.textContent;
  dom.exportBtn.disabled = true;
  dom.exportBtn.textContent = "⏳...";
  try {
    if (uiState.dirtyTabs.has("summary")) renderSummaryTab();
    const blob = await buildExportZip(
      store,
      uiState.summaryCardData,
      (p) => (dom.exportBtn.textContent = p),
    );
    downloadBlob(blob, `youtube-recap-${toDateKey(new Date())}.zip`);
    showStatus("✓ ZIP exportado con datos, tarjeta PNG e imágenes.");
  } catch (err) {
    showStatus(`Error al exportar: ${err.message}`, true);
  } finally {
    dom.exportBtn.disabled = false;
    dom.exportBtn.textContent = orig;
  }
});

dom.importBtn.addEventListener("click", () => {
  window.open(chrome.runtime.getURL("full.html?import=1"), "_blank");
});

dom.importInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const { updatedData, message } = await importFromFile(file, store);
    await chrome.storage.local.set(updatedData);
    Object.assign(store, updatedData);
    if (migrateMusicFlags(store)) await persistMusicFlags(store);
    invalidateAllTabs();
    showStatus(message);
  } catch (err) {
    showStatus(`Error al importar: ${err.message}`, true);
  } finally {
    dom.importInput.value = "";
  }
});

dom.enrichMusicBtn.addEventListener("click", async () => {
  const orig = dom.enrichMusicBtn.textContent;
  dom.enrichMusicBtn.disabled = true;
  try {
    const res = await enrichImported(store, (p) => {
      dom.enrichMusicBtn.textContent = p;
    });
    if (res.none) {
      showStatus(
        "No hay registros de YouTube sin categoría para reclasificar.",
      );
      return;
    }
    if (res.updated > 0) {
      await persistMusicFlags(store);
      invalidateAllTabs();
    }
    showStatus(
      res.updated > 0
        ? `✓ Reclasificados ${res.updated} registros (${res.consulted} videos consultados).${res.remaining > 0 ? ` Quedan ${res.remaining} para otra corrida.` : ""}`
        : `Sin cambios: ${res.consulted} videos consultados, ninguno musical.${res.remaining > 0 ? ` Quedan ${res.remaining} para otra corrida.` : ""}`,
    );
  } catch (err) {
    showStatus(`Error al reclasificar: ${err.message}`, true);
  } finally {
    dom.enrichMusicBtn.disabled = false;
    dom.enrichMusicBtn.textContent = orig;
  }
});

dom.expandBtn.addEventListener("click", () => {
  window.open(chrome.runtime.getURL("full.html"), "_blank");
});
dom.exportImgBtn.addEventListener("click", () =>
  exportPngCard(uiState.summaryCardData, dom.exportImgBtn),
);
dom.calMonthImgBtn.addEventListener("click", () =>
  exportPngCard(uiState.monthCardData, dom.calMonthImgBtn),
);
dom.makePlaylistBtn.addEventListener("click", () =>
  openInstantPlaylist(uiState.topVideoIds),
);
dom.calMonthPlaylistBtn.addEventListener("click", () =>
  openInstantPlaylist(uiState.monthTopVideoIds),
);

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => (p.hidden = true));
    btn.classList.add("active");
    uiState.activeTab = btn.dataset.tab;
    $(`tab-${uiState.activeTab}`).hidden = false;
    if (uiState.dirtyTabs.has(uiState.activeTab)) renderActiveTab();
  });
});

document.querySelectorAll(".sub-pill[data-recent]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".sub-pill[data-recent]")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    uiState.recentMode = btn.dataset.recent;
    renderRecentTab();
  });
});

bindCalendarControls(dom, uiState, renderCalendarTab);

document.querySelectorAll(".ch-sort-pill[data-chsort]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".ch-sort-pill[data-chsort]")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    uiState.channelSort = btn.dataset.chsort;
    renderChannelsTab();
  });
});
document.querySelectorAll(".ch-dur-pill[data-chmin]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".ch-dur-pill[data-chmin]")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    uiState.channelMinSec = Number(btn.dataset.chmin || 0);
    renderChannelsTab();
  });
});

dom.periodSelect.addEventListener("change", invalidateAllTabs);
dom.sourceSelect.addEventListener("change", invalidateAllTabs);

dom.clearBtn.addEventListener("click", () => {
  dom.confirmClearDialog.showModal();
});
dom.cancelClearBtn.addEventListener("click", () => {
  dom.confirmClearDialog.close();
});
dom.confirmClearDialog.addEventListener("click", (e) => {
  if (e.target === dom.confirmClearDialog) dom.confirmClearDialog.close();
});
dom.confirmClearBtn.addEventListener("click", async () => {
  dom.confirmClearDialog.close();
  const empty = emptyStore();
  await chrome.storage.local.set(empty);
  Object.assign(store, empty);
  invalidateAllTabs();
  showStatus("✓ Historial local borrado.");
});

chrome.tabs.onRemoved.addListener((tabId) => {
  npService.removeTab(tabId);
  renderBestNowPlaying();
});

// PATCH C (opcional): debounce 600ms y skip de re-render si el popup está oculto.
let dataRenderTimer = null;
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  const { npChanged, needSync, dataChanged, updates } =
    npService.applyChanges(changes);
  if (needSync) await npService.sync();
  if (npChanged) renderBestNowPlaying();
  if (dataChanged) {
    Object.assign(store, updates);
    if (dataRenderTimer) clearTimeout(dataRenderTimer);
    dataRenderTimer = setTimeout(() => {
      if (!document.hidden) invalidateAllTabs();
    }, 600);
  }
});

async function init() {
  const [{ store: loaded, all }] = await Promise.all([
    loadStore(),
    npService.sync(),
  ]);
  Object.assign(store, loaded);
  if (!all.musicFlagMigratedV1) {
    const changed = migrateMusicFlags(store);
    const payload = { musicFlagMigratedV1: true };
    if (changed) {
      payload.history = store.history;
      payload.skips = store.skips;
      payload.interactions = store.interactions;
    }
    await chrome.storage.local.set(payload);
  }
  const staleKeys = npService.loadInitial(all);
  if (staleKeys.length > 0) chrome.storage.local.remove(staleKeys);
  renderBestNowPlaying();
  invalidateAllTabs();
  setInterval(renderBestNowPlaying, 3000);
}

init();
