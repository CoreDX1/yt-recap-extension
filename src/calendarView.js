import {
  translateCategory,
  toDateKey,
  resolveVideoUrl,
  openInstantPlaylist,
  formatClock,
  formatDuration,
  aggregateTracks,
} from "./utils.js";

function getHeatLevel(seconds, hasActivity) {
  if (!hasActivity) return "";
  if (seconds >= 7200) return "heat-4"; // >= 2h
  if (seconds >= 2700) return "heat-3"; // >= 45m
  if (seconds >= 900) return "heat-2"; // >= 15m
  return "heat-1";
}

function getMondayWeeksOfMonth(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = [];
  let start = 1;
  let num = 1;

  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(year, month, day).getDay(); // 0 = Domingo
    if (dow === 0 || day === daysInMonth) {
      weeks.push({ num: num++, start, end: day });
      start = day + 1;
    }
  }
  return weeks;
}

function getMonthMetrics(plays, inter, searches) {
  const daysMap = new Map();
  let totalSec = 0;
  for (const p of plays) {
    totalSec += p.seconds || 0;
    const k = toDateKey(new Date(p.timestamp));
    daysMap.set(k, (daysMap.get(k) || 0) + (p.seconds || 0));
  }
  for (const it of inter) {
    const k = toDateKey(new Date(it.timestamp));
    if (!daysMap.has(k)) daysMap.set(k, 0);
  }
  for (const s of searches) {
    const k = toDateKey(new Date(s.timestamp));
    if (!daysMap.has(k)) daysMap.set(k, 0);
  }
  return { totalSec, activeDays: daysMap.size, daysMap };
}

function doesEntryMatchQuery(entry, kind, query) {
  if (!query) return true;
  if (kind === "play") {
    return (
      (entry.title || "").toLowerCase().includes(query) ||
      (entry.artist || "").toLowerCase().includes(query)
    );
  }
  if (kind === "inter") {
    return (
      (entry.title || "").toLowerCase().includes(query) ||
      (entry.artist || "").toLowerCase().includes(query)
    );
  }
  return (entry.query || "").toLowerCase().includes(query);
}

export function renderCalendarView({
  dom,
  uiState,
  getFilteredPlays,
  getFilteredMeta,
  store,
  buildTrackRow,
  renderInteractionRow,
  renderSearchRow,
  onExportPng,
}) {
  const sourcePlays = getFilteredPlays(false);
  const sourceInteractions = getFilteredMeta(store.interactions, false);
  const sourceSearches = getFilteredMeta(store.searches, false);

  const playsByDate = new Map();
  const interByDate = new Map();
  const searchesByDate = new Map();

  for (const item of sourcePlays) {
    const k = toDateKey(new Date(item.timestamp));
    if (!playsByDate.has(k)) playsByDate.set(k, []);
    playsByDate.get(k).push(item);
  }
  for (const it of sourceInteractions) {
    const k = toDateKey(new Date(it.timestamp));
    if (!interByDate.has(k)) interByDate.set(k, []);
    interByDate.get(k).push(it);
  }
  for (const s of sourceSearches) {
    const k = toDateKey(new Date(s.timestamp));
    if (!searchesByDate.has(k)) searchesByDate.set(k, []);
    searchesByDate.get(k).push(s);
  }

  const query = (uiState.calSearchQuery || "").trim().toLowerCase();

  // Mostrar resumen de búsqueda dentro del calendario
  if (query) {
    const matchedPlays = sourcePlays.filter((p) =>
      doesEntryMatchQuery(p, "play", query),
    );
    const matchedDays = new Set(
      matchedPlays.map((p) => toDateKey(new Date(p.timestamp))),
    );
    const matchedSec = matchedPlays.reduce(
      (acc, p) => acc + (p.seconds || 0),
      0,
    );
    dom.calSearchSummary.hidden = false;
    dom.calSearchSummary.textContent = `🔎 «${uiState.calSearchQuery.trim()}»: ${matchedDays.size} días · ${matchedPlays.length} rep. · ${formatDuration(matchedSec)}`;
  } else {
    dom.calSearchSummary.hidden = true;
  }

  // Alternar vista Mes vs Año
  const isYearMode = uiState.calViewMode === "year";
  dom.calMonthView.hidden = isYearMode;
  dom.calYearView.hidden = !isYearMode;

  if (isYearMode) {
    renderAnnualView({
      dom,
      uiState,
      playsByDate,
      interByDate,
      searchesByDate,
      query,
      rerender: () =>
        renderCalendarView({
          dom,
          uiState,
          getFilteredPlays,
          getFilteredMeta,
          store,
          buildTrackRow,
          renderInteractionRow,
          renderSearchRow,
          onExportPng,
        }),
    });
    return;
  }

  // --- VISTA MENSUAL ---
  const monthDate = new Date(uiState.calYear, uiState.calMonth, 1);
  dom.calMonthLabel.textContent = new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(monthDate);

  const rawMonthWord = new Intl.DateTimeFormat("es-AR", {
    month: "long",
  }).format(monthDate);
  const shortMonth = new Intl.DateTimeFormat("es-AR", {
    month: "short",
  }).format(monthDate);
  dom.calWeeksTitle.textContent = `Top por semana de ${rawMonthWord}`;

  // Lunes = 0 ... Domingo = 6
  const firstMondayIdx = (monthDate.getDay() + 6) % 7;
  const daysInMonth = new Date(
    uiState.calYear,
    uiState.calMonth + 1,
    0,
  ).getDate();
  const prevMonthDays = new Date(
    uiState.calYear,
    uiState.calMonth,
    0,
  ).getDate();
  const todayKey = toDateKey(new Date());

  // Calcular rachas visuales dentro del mes actual
  const streakDaysSet = new Set();
  let maxMonthStreak = 0;
  let run = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const k = toDateKey(new Date(uiState.calYear, uiState.calMonth, d));
    const active =
      (playsByDate.get(k)?.length || 0) > 0 ||
      (interByDate.get(k)?.length || 0) > 0;
    if (active) {
      run.push(k);
    } else {
      if (run.length >= 2) run.forEach((rk) => streakDaysSet.add(rk));
      if (run.length > maxMonthStreak) maxMonthStreak = run.length;
      run = [];
    }
  }
  if (run.length >= 2) run.forEach((rk) => streakDaysSet.add(rk));
  if (run.length > maxMonthStreak) maxMonthStreak = run.length;

  const cells = [];
  for (let i = firstMondayIdx - 1; i >= 0; i--) {
    cells.push({
      date: new Date(uiState.calYear, uiState.calMonth - 1, prevMonthDays - i),
      otherMonth: true,
    });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      date: new Date(uiState.calYear, uiState.calMonth, day),
      otherMonth: false,
    });
  }
  const rem = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= rem; i++) {
    cells.push({
      date: new Date(uiState.calYear, uiState.calMonth + 1, i),
      otherMonth: true,
    });
  }

  dom.calGrid.replaceChildren(
    ...cells.map(({ date, otherMonth }) => {
      const key = toDateKey(date);
      const dp = playsByDate.get(key) || [];
      const di = interByDate.get(key) || [];
      const ds = searchesByDate.get(key) || [];
      const daySec = dp.reduce((acc, p) => acc + (p.seconds || 0), 0);
      const hasAny = dp.length > 0 || di.length > 0 || ds.length > 0;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cal-day";
      btn.textContent = String(date.getDate());

      if (otherMonth) btn.classList.add("other-month");
      if (key === todayKey) btn.classList.add("today");
      if (!otherMonth && streakDaysSet.has(key)) btn.classList.add("in-streak");

      const heat = getHeatLevel(daySec, hasAny);
      if (heat) btn.classList.add(heat);

      const lk = di.filter((x) => x.type === "like").length;
      const sb = di.filter((x) => x.type === "subscribe").length;

      if (hasAny) {
        const tips = [];
        if (dp.length)
          tips.push(`${formatDuration(daySec)} (${dp.length} rep.)`);
        if (lk) tips.push(`❤️ ${lk}`);
        if (sb) tips.push(`🔔 ${sb}`);
        if (ds.length) tips.push(`🔍 ${ds.length}`);
        btn.title = tips.join(" · ");

        if (lk > 0 || sb > 0 || (ds.length > 0 && dp.length === 0)) {
          const dots = document.createElement("span");
          dots.className = "cal-dots";
          if (lk > 0) {
            const d1 = document.createElement("span");
            d1.className = "cal-dot like";
            dots.append(d1);
          }
          if (sb > 0) {
            const d2 = document.createElement("span");
            d2.className = "cal-dot sub";
            dots.append(d2);
          }
          if (ds.length > 0 && dp.length === 0) {
            const d3 = document.createElement("span");
            d3.className = "cal-dot search";
            dots.append(d3);
          }
          btn.append(dots);
        }
      }

      if (query) {
        const dayMatches =
          dp.some((p) => doesEntryMatchQuery(p, "play", query)) ||
          di.some((it) => doesEntryMatchQuery(it, "inter", query)) ||
          ds.some((s) => doesEntryMatchQuery(s, "search", query));
        if (dayMatches) btn.classList.add("match-filter");
        else if (hasAny) btn.classList.add("dimmed");
      }

      if (key === uiState.selectedDateKey) btn.classList.add("selected");

      btn.addEventListener("click", () => {
        uiState.selectedDateKey = key;
        if (otherMonth) {
          uiState.calYear = date.getFullYear();
          uiState.calMonth = date.getMonth();
        }
        renderCalendarView({
          dom,
          uiState,
          getFilteredPlays,
          getFilteredMeta,
          store,
          buildTrackRow,
          renderInteractionRow,
          renderSearchRow,
          onExportPng,
        });
      });

      return btn;
    }),
  );

  // --- DETALLE DEL DÍA SELECCIONADO + RESUMEN RÁPIDO DEL DÍA ---
  const [sy, sm, sd] = uiState.selectedDateKey.split("-").map(Number);
  const formattedDay = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(sy, sm - 1, sd));

  const dayPlays = playsByDate.get(uiState.selectedDateKey) || [];
  const dayInter = interByDate.get(uiState.selectedDateKey) || [];
  const dayLikes = dayInter.filter((x) => x.type === "like");
  const daySubs = dayInter.filter((x) => x.type === "subscribe");
  const daySearches = searchesByDate.get(uiState.selectedDateKey) || [];

  const dayTotalSec = dayPlays.reduce((acc, it) => acc + (it.seconds || 0), 0);
  const dayMeta = [];
  if (dayPlays.length)
    dayMeta.push(`${formatDuration(dayTotalSec)} (${dayPlays.length}x)`);
  if (dayLikes.length) dayMeta.push(`❤️ ${dayLikes.length}`);
  if (daySubs.length) dayMeta.push(`🔔 ${daySubs.length}`);
  if (daySearches.length) dayMeta.push(`🔍 ${daySearches.length}`);
  dom.calDayTitle.textContent = dayMeta.length
    ? `${formattedDay} · ${dayMeta.join(" · ")}`
    : formattedDay;

  if (dayPlays.length > 0) {
    const sortedAsc = [...dayPlays].sort((a, b) => a.timestamp - b.timestamp);
    const firstTs = sortedAsc[0].timestamp;
    const lastItem = sortedAsc[sortedAsc.length - 1];
    const lastTs = lastItem.timestamp + (lastItem.seconds || 0) * 1000;
    const tFmt = (t) =>
      new Date(t).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

    const dayCh = new Map();
    const dayCat = new Map();
    for (const p of dayPlays) {
      dayCh.set(
        p.artist || "YouTube",
        (dayCh.get(p.artist || "YouTube") || 0) + (p.seconds || 1),
      );
      const c = p.category || (p.source === "yt_music" ? "Music" : "");
      if (c) dayCat.set(c, (dayCat.get(c) || 0) + (p.seconds || 1));
    }
    const topDayCh = [...dayCh.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const topDayCat = [...dayCat.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    const summaryParts = [`🕒 ${tFmt(firstTs)} – ${tFmt(lastTs)}`];
    if (topDayCh) summaryParts.push(`📺 ${topDayCh}`);
    if (topDayCat) summaryParts.push(`🏷️ ${translateCategory(topDayCat)}`);
    dom.calDaySummary.textContent = summaryParts.join(" · ");
    dom.calDaySummary.hidden = false;
  } else {
    dom.calDaySummary.hidden = true;
  }

  const combined = [];
  if (uiState.calDayMode === "all" || uiState.calDayMode === "plays") {
    dayPlays.forEach((d) => {
      if (!query || doesEntryMatchQuery(d, "play", query))
        combined.push({ kind: "play", ts: d.timestamp, d });
    });
  }
  if (uiState.calDayMode === "all" || uiState.calDayMode === "likes") {
    dayLikes.forEach((d) => {
      if (!query || doesEntryMatchQuery(d, "inter", query))
        combined.push({ kind: "like", ts: d.timestamp, d });
    });
  }
  if (uiState.calDayMode === "all" || uiState.calDayMode === "subs") {
    daySubs.forEach((d) => {
      if (!query || doesEntryMatchQuery(d, "inter", query))
        combined.push({ kind: "sub", ts: d.timestamp, d });
    });
  }
  if (uiState.calDayMode === "all" || uiState.calDayMode === "searches") {
    daySearches.forEach((d) => {
      if (!query || doesEntryMatchQuery(d, "search", query))
        combined.push({ kind: "search", ts: d.timestamp, d });
    });
  }
  combined.sort((a, b) => b.ts - a.ts);

  dom.calDayEmpty.hidden = combined.length > 0;
  dom.calDayList.replaceChildren(
    ...combined.map(({ kind, ts, d }) => {
      const timeStr = new Date(ts).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      if (kind === "play") {
        const sub = `${d.artist} · ${timeStr}${d.isLoop ? " · 🔁 Bucle" : ""}`;
        return buildTrackRow(
          d.isLoop ? "🔁" : "•",
          d.artwork,
          d.title,
          sub,
          d.seconds > 0 ? formatClock(d.seconds) : "Takeout",
          { href: resolveVideoUrl(d) || undefined },
        );
      }
      if (kind === "like" || kind === "sub") return renderInteractionRow(d);
      return renderSearchRow(d);
    }),
  );

  // --- MÉTRICAS DEL MES + COMPARATIVA VS MES ANTERIOR ---
  const inMonth = (y, m) => (item) => {
    const d = new Date(item.timestamp);
    return d.getFullYear() === y && d.getMonth() === m;
  };
  const monthPlays = sourcePlays.filter(
    inMonth(uiState.calYear, uiState.calMonth),
  );
  const monthInter = sourceInteractions
    .filter(inMonth(uiState.calYear, uiState.calMonth))
    .sort((a, b) => b.timestamp - a.timestamp);
  const monthSearches = sourceSearches.filter(
    inMonth(uiState.calYear, uiState.calMonth),
  );

  const prevY = uiState.calMonth === 0 ? uiState.calYear - 1 : uiState.calYear;
  const prevM = uiState.calMonth === 0 ? 11 : uiState.calMonth - 1;
  const prevPlays = sourcePlays.filter(inMonth(prevY, prevM));
  const prevWord = new Intl.DateTimeFormat("es-AR", { month: "short" }).format(
    new Date(prevY, prevM, 1),
  );

  const {
    totalSec: monthTotalSec,
    activeDays,
    daysMap: monthDaysMap,
  } = getMonthMetrics(monthPlays, monthInter, monthSearches);
  const prevTotalSec = prevPlays.reduce((acc, p) => acc + (p.seconds || 0), 0);

  if (monthPlays.length === 0 && monthInter.length === 0) {
    dom.calMonthStatsBox.hidden = true;
  } else {
    dom.calMonthStatsBox.hidden = false;
    const avgSec = activeDays > 0 ? Math.round(monthTotalSec / activeDays) : 0;
    const recordEntry = [...monthDaysMap.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0];
    let recordStr = "—";
    if (recordEntry) {
      const [ry, rm, rd] = recordEntry[0].split("-").map(Number);
      const rFmt = new Intl.DateTimeFormat("es-AR", {
        weekday: "short",
        day: "numeric",
      }).format(new Date(ry, rm - 1, rd));
      recordStr = `${rFmt} (${formatDuration(recordEntry[1])})`;
    }

    const stats = [
      ["Días activos", `${activeDays}/${daysInMonth}`],
      ["Promedio/día", formatDuration(avgSec)],
      [
        "🔥 Racha máx.",
        `${maxMonthStreak} ${maxMonthStreak === 1 ? "día" : "días"}`,
      ],
    ];
    dom.calMonthStatsGrid.replaceChildren(
      ...stats.map(([lbl, val]) => {
        const card = document.createElement("div");
        card.className = "stat-card";
        const sp = document.createElement("span");
        sp.className = "stat-label";
        sp.textContent = lbl;
        const st = document.createElement("strong");
        st.textContent = val;
        card.append(sp, st);
        return card;
      }),
    );

    const diffSec = monthTotalSec - prevTotalSec;
    dom.calMonthCompare.className = "cal-compare-line";
    if (prevTotalSec > 0) {
      const pct = Math.round((diffSec / prevTotalSec) * 100);
      const arrow = diffSec >= 0 ? "▲" : "▼";
      dom.calMonthCompare.classList.add(diffSec >= 0 ? "up" : "down");
      dom.calMonthCompare.textContent = `${arrow} ${diffSec >= 0 ? "+" : "-"}${formatDuration(
        Math.abs(diffSec),
      )} (${pct >= 0 ? "+" : ""}${pct}%) vs ${prevWord} · 🏆 Récord: ${recordStr}`;
      dom.calMonthCompare.hidden = false;
    } else if (recordEntry) {
      dom.calMonthCompare.textContent = `🏆 Día récord del mes: ${recordStr}`;
      dom.calMonthCompare.hidden = false;
    } else {
      dom.calMonthCompare.hidden = true;
    }
  }

  // --- TOP DEL MES ---
  const monthLoops = monthPlays.filter((it) => it.isLoop).length;
  const monthLikes = monthInter.filter((x) => x.type === "like").length;
  const monthSubs = monthInter.filter((x) => x.type === "subscribe").length;

  const mMeta = [];
  if (monthPlays.length)
    mMeta.push(`${formatDuration(monthTotalSec)} (${monthPlays.length}x)`);
  if (monthLoops) mMeta.push(`🔁${monthLoops}`);
  if (monthLikes) mMeta.push(`❤️${monthLikes}`);
  if (monthSubs) mMeta.push(`🔔${monthSubs}`);
  dom.calMonthTopTitle.textContent = mMeta.length
    ? `Top de ${rawMonthWord} · ${mMeta.join(" · ")}`
    : `Top de ${rawMonthWord}`;

  if (monthPlays.length === 0) {
    uiState.monthTopVideoIds = [];
    uiState.monthCardData = null;
    dom.calMonthImgBtn.hidden = true;
    dom.calMonthPlaylistBtn.hidden = true;
    dom.calMonthTopList.replaceChildren();
    dom.calMonthTopEmpty.hidden = false;
    dom.calMonthChannelsBox.hidden = true;
    dom.calMonthCatsBox.hidden = true;
    dom.calWeekdayBox.hidden = true;
  } else {
    dom.calMonthTopEmpty.hidden = true;
    const topMonth = aggregateTracks(monthPlays);
    uiState.monthTopVideoIds = topMonth
      .map((t) => t.videoId)
      .filter(Boolean)
      .slice(0, 20);
    dom.calMonthPlaylistBtn.hidden = uiState.monthTopVideoIds.length === 0;

    const mChannels = new Map();
    const mCats = new Map();
    const weekdaySec = new Array(7).fill(0); // 0=Lun .. 6=Dom
    const weekdayPlays = new Array(7).fill(0);

    for (const it of monthPlays) {
      const ak = it.artist || "YouTube";
      const curCh = mChannels.get(ak) || {
        name: ak,
        plays: 0,
        seconds: 0,
        artwork: it.artwork,
        url: it.channelUrl || "",
      };
      curCh.plays += 1;
      curCh.seconds += it.seconds || 0;
      if (!curCh.artwork && it.artwork) curCh.artwork = it.artwork;
      if (!curCh.url && it.channelUrl) curCh.url = it.channelUrl;
      mChannels.set(ak, curCh);

      const cat = it.category || (it.source === "yt_music" ? "Music" : "");
      if (cat) {
        const curC = mCats.get(cat) || { plays: 0, seconds: 0 };
        curC.plays += 1;
        curC.seconds += it.seconds || 0;
        mCats.set(cat, curC);
      }

      const wdIdx = (new Date(it.timestamp).getDay() + 6) % 7;
      weekdaySec[wdIdx] += it.seconds || 0;
      weekdayPlays[wdIdx] += 1;
    }

    const sortedChannels = [...mChannels.values()].sort(
      (a, b) => b.seconds - a.seconds || b.plays - a.plays,
    );
    const topMonthArtist = sortedChannels[0]?.name || "—";

    uiState.monthCardData = {
      subtitle: `${rawMonthWord.toUpperCase()} ${uiState.calYear}`,
      topTracks: topMonth.slice(0, 5),
      totalSeconds: monthTotalSec,
      totalPlays: monthPlays.length,
      totalLoops: monthLoops,
      topArtist: topMonthArtist,
    };
    dom.calMonthImgBtn.hidden = topMonth.length === 0;

    dom.calMonthTopList.replaceChildren(
      ...topMonth.slice(0, 10).map((track, idx) => {
        const mins =
          track.seconds > 0
            ? `${Math.max(1, Math.round(track.seconds / 60))}m`
            : "Imp.";
        const right =
          track.loops > 0
            ? `${track.plays}x (🔁${track.loops}) · ${mins}`
            : `${track.plays}x · ${mins}`;
        return buildTrackRow(
          String(idx + 1),
          track.artwork,
          track.title,
          track.artist,
          right,
          {
            href: track.videoUrl || undefined,
          },
        );
      }),
    );

    // Top canales del mes por duración
    const chWithTime = sortedChannels.filter((c) => c.seconds > 0);
    dom.calMonthChannelsBox.hidden = chWithTime.length === 0;
    if (chWithTime.length > 0) {
      dom.calMonthChannelsTitle.textContent = `⏱️ Top canales de ${rawMonthWord}`;
      const maxChSec = chWithTime[0].seconds;
      dom.calMonthChannelsList.replaceChildren(
        ...chWithTime.slice(0, 5).map((ch, idx) => {
          const share =
            monthTotalSec > 0
              ? Math.round((ch.seconds / monthTotalSec) * 100)
              : 0;
          const barPct =
            maxChSec > 0 ? Math.round((ch.seconds / maxChSec) * 100) : 0;
          return buildTrackRow(
            String(idx + 1),
            ch.artwork,
            ch.name,
            `${ch.plays} rep. · ${share}% del mes`,
            formatDuration(ch.seconds),
            { href: ch.url || undefined, barPct },
          );
        }),
      );
    }

    // Categorías del mes
    const catList = [...mCats.entries()].sort(
      (a, b) => b[1].seconds - a[1].seconds || b[1].plays - a[1].plays,
    );
    dom.calMonthCatsBox.hidden = catList.length === 0;
    if (catList.length > 0) {
      dom.calMonthCatsTitle.textContent = `Categorías de ${rawMonthWord}`;
      const totalCatW = catList.reduce(
        (acc, [, st]) => acc + (st.seconds || st.plays),
        0,
      );
      dom.calMonthCatsList.replaceChildren(
        ...catList.slice(0, 5).map(([cat, st]) => {
          const pct =
            totalCatW > 0
              ? Math.max(
                  4,
                  Math.round(((st.seconds || st.plays) / totalCatW) * 100),
                )
              : 0;
          const row = document.createElement("div");
          row.className = "cat-row";
          const top = document.createElement("div");
          top.className = "cat-row-top";
          const lbl = document.createElement("span");
          lbl.textContent = translateCategory(cat);
          const meta = document.createElement("span");
          meta.textContent = `${pct}% · ${st.plays}x (${formatDuration(st.seconds)})`;
          top.append(lbl, meta);
          const track = document.createElement("div");
          track.className = "cat-track";
          const fill = document.createElement("div");
          fill.className = "cat-fill";
          fill.style.width = `${pct}%`;
          track.append(fill);
          row.append(top, track);
          return row;
        }),
      );
    }

    // Rendimiento Lun-Dom
    dom.calWeekdayBox.hidden = false;
    const wdLabels = ["L", "M", "X", "J", "V", "S", "D"];
    const wdFull = [
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado",
      "Domingo",
    ];
    const usePlaysFallback = Math.max(...weekdaySec) === 0;
    const values = usePlaysFallback ? weekdayPlays : weekdaySec;
    const maxWd = Math.max(...values);

    dom.calWeekdayChart.replaceChildren(
      ...values.map((val, i) => {
        const col = document.createElement("div");
        col.className = "wd-col";
        col.title = `${wdFull[i]}: ${formatDuration(weekdaySec[i])} (${weekdayPlays[i]} rep.)`;

        const bar = document.createElement("div");
        bar.className =
          val === 0 ? "wd-bar zero" : val === maxWd ? "wd-bar peak" : "wd-bar";
        bar.style.height =
          val === 0
            ? "4px"
            : `${Math.max(8, Math.round((val / maxWd) * 100))}%`;

        const lbl = document.createElement("span");
        lbl.className = "wd-lbl";
        lbl.textContent = wdLabels[i];

        col.append(bar, lbl);
        return col;
      }),
    );
  }

  dom.calMonthSocialBox.hidden = monthInter.length === 0;
  if (monthInter.length > 0) {
    dom.calMonthSocialTitle.textContent = `Me gusta y suscripciones de ${rawMonthWord}`;
    dom.calMonthSocialList.replaceChildren(
      ...monthInter.slice(0, 20).map(renderInteractionRow),
    );
  }

  // --- SEMANAS REALES (LUN-DOM) + BOTÓN PNG Y PLAYLIST SEMANAL ---
  const weekRanges = getMondayWeeksOfMonth(uiState.calYear, uiState.calMonth);
  dom.calWeeksList.replaceChildren(
    ...weekRanges.map((w) => {
      const wItems = monthPlays.filter((it) => {
        const day = new Date(it.timestamp).getDate();
        return day >= w.start && day <= w.end;
      });
      const card = document.createElement("div");
      card.className = wItems.length === 0 ? "week-card empty" : "week-card";

      const header = document.createElement("div");
      header.className = "week-header";
      const title = document.createElement("span");
      title.className = "week-title";
      const rangeText =
        w.start === w.end
          ? `${w.start} ${shortMonth}`
          : `${w.start}–${w.end} ${shortMonth}`;
      title.textContent = `Semana ${w.num} (${rangeText})`;

      const rightBox = document.createElement("div");
      rightBox.className = "week-right";
      const meta = document.createElement("span");
      meta.className = "week-meta";

      if (wItems.length === 0) {
        meta.textContent = "Sin actividad";
        rightBox.append(meta);
        header.append(title, rightBox);
        card.append(header);
        return card;
      }

      const wSec = wItems.reduce((acc, it) => acc + (it.seconds || 0), 0);
      const wLoops = wItems.filter((it) => it.isLoop).length;
      meta.textContent = `${formatDuration(wSec)} · ${wItems.length} rep.`;
      rightBox.append(meta);

      const topWeek = aggregateTracks(wItems);
      const wArtists = new Map();
      for (const it of wItems) {
        const k = it.artist || "YouTube";
        wArtists.set(k, (wArtists.get(k) || 0) + (it.seconds || 1));
      }
      const topWeekArtist =
        [...wArtists.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

      const imgBtn = document.createElement("button");
      imgBtn.className = "mini-btn";
      imgBtn.textContent = "🖼️";
      imgBtn.title = "Descargar tarjeta PNG de esta semana";
      imgBtn.addEventListener("click", () =>
        onExportPng(
          {
            subtitle: `SEMANA ${w.num} (${rangeText.toUpperCase()})`,
            topTracks: topWeek.slice(0, 5),
            totalSeconds: wSec,
            totalPlays: wItems.length,
            totalLoops: wLoops,
            topArtist: topWeekArtist,
          },
          imgBtn,
        ),
      );
      rightBox.append(imgBtn);

      const weekIds = topWeek
        .map((t) => t.videoId)
        .filter(Boolean)
        .slice(0, 20);
      if (weekIds.length > 0) {
        const plBtn = document.createElement("button");
        plBtn.className = "mini-btn";
        plBtn.textContent = "▶";
        plBtn.title = "Crear playlist de esta semana";
        plBtn.addEventListener("click", () => openInstantPlaylist(weekIds));
        rightBox.append(plBtn);
      }

      header.append(title, rightBox);

      const ul = document.createElement("ul");
      ul.className = "week-tracks";
      ul.append(
        ...topWeek.slice(0, 3).map((track, idx) => {
          const mins =
            track.seconds > 0
              ? `${Math.max(1, Math.round(track.seconds / 60))}m`
              : "Imp.";
          const right =
            track.loops > 0
              ? `${track.plays}x (🔁${track.loops}) · ${mins}`
              : `${track.plays}x · ${mins}`;
          return buildTrackRow(
            String(idx + 1),
            track.artwork,
            track.title,
            track.artist,
            right,
            {
              href: track.videoUrl || undefined,
            },
          );
        }),
      );
      card.append(header, ul);
      return card;
    }),
  );
}

// --- VISTA ANUAL (365 DÍAS + 12 MESES) ---
function renderAnnualView({
  dom,
  uiState,
  playsByDate,
  interByDate,
  searchesByDate,
  query,
  rerender,
}) {
  const year = uiState.calYear;
  dom.calYearLabel.textContent = String(year);

  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);
  const startPad = (jan1.getDay() + 6) % 7; // Lunes=0

  let yearSec = 0;
  let yearPlays = 0;
  let yearActiveDays = 0;

  const gridNodes = [];
  for (let i = 0; i < startPad; i++) {
    const pad = document.createElement("span");
    pad.className = "yr-cell empty-pad";
    gridNodes.push(pad);
  }

  for (let d = new Date(jan1); d <= dec31; d.setDate(d.getDate() + 1)) {
    const key = toDateKey(d);
    const dp = playsByDate.get(key) || [];
    const di = interByDate.get(key) || [];
    const ds = searchesByDate.get(key) || [];
    const sec = dp.reduce((acc, p) => acc + (p.seconds || 0), 0);
    const hasAny = dp.length > 0 || di.length > 0 || ds.length > 0;

    if (hasAny) yearActiveDays += 1;
    yearSec += sec;
    yearPlays += dp.length;

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "yr-cell";
    const heat = getHeatLevel(sec, hasAny);
    if (heat) cell.classList.add(heat);

    if (query) {
      const matches =
        dp.some((p) => doesEntryMatchQuery(p, "play", query)) ||
        di.some((it) => doesEntryMatchQuery(it, "inter", query)) ||
        ds.some((s) => doesEntryMatchQuery(s, "search", query));
      if (matches) cell.classList.add("match-filter");
      else if (hasAny) cell.classList.add("dimmed");
    }

    const labelDate = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${year}`;
    cell.title = hasAny
      ? `${labelDate} · ${formatDuration(sec)} (${dp.length} rep.)`
      : labelDate;

    const targetMonth = d.getMonth();
    cell.addEventListener("click", () => {
      uiState.calViewMode = "month";
      uiState.calMonth = targetMonth;
      uiState.selectedDateKey = key;
      document.querySelectorAll(".cal-mode-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.calview === "month");
      });
      rerender();
    });

    gridNodes.push(cell);
  }

  dom.calYearStats.textContent = `${formatDuration(yearSec)} · ${yearPlays} reproducciones · ${yearActiveDays} días activos`;
  dom.calYearGrid.replaceChildren(...gridNodes);
  dom.calYearHeatmapScroll.scrollLeft = dom.calYearHeatmapScroll.scrollWidth;

  // 12 tarjetitas mensuales
  const monthCards = [];
  for (let m = 0; m < 12; m++) {
    const mDate = new Date(year, m, 1);
    const mName = new Intl.DateTimeFormat("es-AR", { month: "long" }).format(
      mDate,
    );
    const days = new Date(year, m + 1, 0).getDate();
    let mSec = 0;
    let mPlays = 0;
    for (let day = 1; day <= days; day++) {
      const k = toDateKey(new Date(year, m, day));
      const dp = playsByDate.get(k) || [];
      mPlays += dp.length;
      mSec += dp.reduce((acc, p) => acc + (p.seconds || 0), 0);
    }

    const card = document.createElement("button");
    card.type = "button";
    card.className = mPlays === 0 ? "yr-month-card empty" : "yr-month-card";

    const title = document.createElement("div");
    title.className = "yr-m-name";
    title.textContent = mName;

    const meta = document.createElement("div");
    meta.className = "yr-m-meta";
    meta.textContent =
      mPlays > 0 ? `${formatDuration(mSec)} · ${mPlays}x` : "Sin datos";

    card.append(title, meta);
    card.addEventListener("click", () => {
      uiState.calViewMode = "month";
      uiState.calMonth = m;
      uiState.selectedDateKey = toDateKey(new Date(year, m, 1));
      document.querySelectorAll(".cal-mode-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.calview === "month");
      });
      rerender();
    });

    monthCards.push(card);
  }

  dom.calYearMonthsGrid.replaceChildren(...monthCards);
}
