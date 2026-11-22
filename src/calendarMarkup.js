// src/calendarMarkup.js
// Fuente única del bloque de calendario: la inyectan popup.js y full.js.
// Los elementos nuevos nacen con `hidden`: el renderer los revela solo en
// variant "full", así el popup conserva exactamente su UI actual.
export const CALENDAR_MARKUP = `
<div class="cal-toolbar">
<div class="cal-mode-switch">
<button type="button" class="cal-mode-btn active" data-calview="month">Mes</button>
<button type="button" class="cal-mode-btn" data-calview="year">Año</button>
</div>
<div class="cal-search-wrap">
<input id="calSearchInput" type="search" class="cal-search-input" autocomplete="off" spellcheck="false" enterkeyhint="search" placeholder="Filtrar días por canal o tema…" />
</div>
</div>
<div id="calSearchSummary" class="cal-search-summary" hidden></div>
<div id="calRangeSummary" class="cal-range-summary" hidden>
<span class="cal-range-ico" aria-hidden="true"></span>
<span id="calRangeText"></span>
<button id="calRangeClear" type="button" class="leg-clear">Limpiar rango</button>
</div>
<div id="calMonthView">
<section class="calendar-box">
<div class="cal-header">
<span id="calMonthLabel" class="cal-month-label">—</span>
<div class="cal-nav">
<button id="calTodayBtn" type="button" class="cal-today-btn" title="Ir a hoy">Hoy</button>
<button id="calPrevBtn" type="button" class="cal-arrow-btn" aria-label="Mes anterior" title="Mes anterior (Re Pág)"><span aria-hidden="true">‹</span></button>
<button id="calNextBtn" type="button" class="cal-arrow-btn" aria-label="Mes siguiente" title="Mes siguiente (Av Pág)"><span aria-hidden="true">›</span></button>
</div>
</div>
<div id="calLegendPro" class="cal-legend-pro" hidden>
<div id="calScaleToggle" class="cal-scale-toggle" role="group" aria-label="Escala de intensidad">
<button type="button" class="cal-scale-btn active" data-calscale="relative" title="Relativa al día más fuerte del mes">Relativa</button>
<button type="button" class="cal-scale-btn" data-calscale="absolute" title="Umbrales fijos: 15m / 45m / 2h">Absoluta</button>
</div>
<div class="cal-legend-scale">
<span class="leg-txt">Menos</span>
<button type="button" class="leg-box heat-1" data-callevel="1" aria-pressed="false"></button>
<button type="button" class="leg-box heat-2" data-callevel="2" aria-pressed="false"></button>
<button type="button" class="leg-box heat-3" data-callevel="3" aria-pressed="false"></button>
<button type="button" class="leg-box heat-4" data-callevel="4" aria-pressed="false"></button>
<span class="leg-txt">Más</span>
<button id="calLevelClear" type="button" class="leg-clear" hidden>Quitar filtro</button>
</div>
<span id="calLegendHint" class="cal-legend-hint"></span>
<div class="cal-legend-marks">
<span class="cal-dot like" aria-hidden="true"></span><span class="leg-txt">Like</span>
<span class="cal-dot sub" aria-hidden="true"></span><span class="leg-txt">Sub</span>
<span class="cal-dot search" aria-hidden="true"></span><span class="leg-txt">Búsqueda</span>
<span id="calLegendCrown" class="cal-legend-crown" aria-hidden="true"></span><span class="leg-txt">Récord</span>
</div>
</div>
<div class="cal-weekdays">
<span><abbr title="Lunes">L</abbr></span>
<span><abbr title="Martes">M</abbr></span>
<span><abbr title="Miércoles">X</abbr></span>
<span><abbr title="Jueves">J</abbr></span>
<span><abbr title="Viernes">V</abbr></span>
<span><abbr title="Sábado">S</abbr></span>
<span><abbr title="Domingo">D</abbr></span>
</div>
<div id="calGrid" class="cal-grid"></div>
<div id="calMonthMeta" class="cal-month-meta" hidden></div>
<div class="cal-legend">
<span class="leg-txt">Menos</span>
<span class="leg-box heat-1" aria-hidden="true"></span>
<span class="leg-box heat-2" aria-hidden="true"></span>
<span class="leg-box heat-3" aria-hidden="true"></span>
<span class="leg-box heat-4" aria-hidden="true"></span>
<span class="leg-txt">Más</span>
<span class="leg-sep" aria-hidden="true">·</span>
<span class="cal-dot like" aria-hidden="true"></span><span class="leg-txt">Like</span>
<span class="cal-dot sub" aria-hidden="true"></span><span class="leg-txt">Sub</span>
</div>
</section>
<section id="calMonthStatsBox" class="cal-month-stats" hidden>
<div id="calMonthStatsGrid" class="stats-grid compact-grid"></div>
<div id="calMonthCompare" class="cal-compare-line" hidden></div>
<div id="calRecordCard" class="cal-record-card" hidden></div>
</section>
<section class="cal-section cal-day-panel">
<div id="calDayHead" class="cal-day-head" hidden></div>
<h2 id="calDayTitle">Actividad del día</h2>
<div id="calDaySummary" class="cal-day-summary" hidden></div>
<div id="calDayFilters" class="sub-pills compact-pills">
<button type="button" class="cal-pill sub-pill active" data-calday="all">Todo</button>
<button type="button" class="cal-pill sub-pill" data-calday="plays"><span data-pillico="play" data-size="11" aria-hidden="true">▶</span> Reprod.</button>
<button type="button" class="cal-pill sub-pill" data-calday="likes"><span data-pillico="heartFill" data-size="11" aria-hidden="true">❤️</span> Likes</button>
<button type="button" class="cal-pill sub-pill" data-calday="subs"><span data-pillico="bell" data-size="11" aria-hidden="true">🔔</span> Suscrip.</button>
<button type="button" class="cal-pill sub-pill" data-calday="searches"><span data-pillico="search" data-size="11" aria-hidden="true">🔍</span> Búsquedas</button>
</div>
<ul id="calDayList" class="top-list compact"></ul>
<p id="calDayEmpty" class="empty-msg small" hidden>No se registró actividad en esta fecha.</p>
</section>
<section class="cal-section">
<div class="section-header">
<h2 id="calMonthTopTitle">Top del mes</h2>
<div class="section-actions">
<button id="calMonthImgBtn" type="button" class="mini-btn" hidden title="Descargar tarjeta PNG del mes"><span data-pillico="export" data-size="11" aria-hidden="true">🖼️</span> PNG</button>
<button id="calMonthPlaylistBtn" type="button" class="mini-btn" hidden title="Crear playlist del mes"><span data-pillico="play" data-size="11" aria-hidden="true">▶</span> Playlist</button>
</div>
</div>
<ul id="calMonthTopList" class="top-list compact"></ul>
<p id="calMonthTopEmpty" class="empty-msg small" hidden>Sin reproducciones en este mes.</p>
</section>
<section id="calMonthChannelsBox" class="activity-box" hidden>
<h2 id="calMonthChannelsTitle">Top canales del mes</h2>
<ul id="calMonthChannelsList" class="top-list compact"></ul>
</section>
<section id="calMonthCatsBox" class="activity-box" hidden>
<h2 id="calMonthCatsTitle">Categorías del mes</h2>
<div id="calMonthCatsList" class="cat-bars"></div>
</section>
<section id="calWeekdayBox" class="activity-box" hidden>
<h2>Rendimiento por día de la semana</h2>
<div id="calWeekdayChart" class="weekday-chart"></div>
</section>
<section id="calMonthSocialBox" class="cal-section" hidden>
<h2 id="calMonthSocialTitle">Me gusta y suscripciones del mes</h2>
<ul id="calMonthSocialList" class="top-list compact"></ul>
</section>
<section class="cal-section">
<h2 id="calWeeksTitle">Top por semana</h2>
<div id="calWeeksList" class="weeks-list"></div>
</section>
</div>
<div id="calYearView" hidden>
<section class="calendar-box">
<div class="cal-header">
<span id="calYearLabel" class="cal-month-label">2026</span>
<div class="cal-nav">
<div id="calYearZoom" class="cal-scale-toggle" role="group" aria-label="Tamaño del mapa anual" hidden>
<button type="button" class="cal-scale-btn" data-yrzoom="10" title="Celdas pequeñas">S</button>
<button type="button" class="cal-scale-btn active" data-yrzoom="12" title="Celdas medianas">M</button>
<button type="button" class="cal-scale-btn" data-yrzoom="14" title="Celdas grandes">L</button>
</div>
<button id="calYearPrevBtn" type="button" class="cal-arrow-btn" aria-label="Año anterior" title="Año anterior"><span aria-hidden="true">‹</span></button>
<button id="calYearNextBtn" type="button" class="cal-arrow-btn" aria-label="Año siguiente" title="Año siguiente"><span aria-hidden="true">›</span></button>
</div>
</div>
<div id="calYearStats" class="cal-year-stats"></div>
<div id="calYearHeatmapScroll" class="year-heatmap-scroll">
<div id="calYearMonths" class="yr-months" hidden aria-hidden="true"></div>
<div id="calYearDays" class="yr-days" hidden aria-hidden="true"></div>
<div id="calYearGrid" class="year-heatmap-grid"></div>
</div>
</section>
<section class="cal-section">
<h2>Resumen de los 12 meses</h2>
<div id="calYearMonthsGrid" class="year-months-grid"></div>
</section>
</div>
`;

export const CALENDAR_DOM_IDS = [
  "calSearchInput",
  "calSearchSummary",
  "calRangeSummary",
  "calRangeText",
  "calRangeClear",
  "calMonthView",
  "calYearView",
  "calMonthLabel",
  "calPrevBtn",
  "calNextBtn",
  "calTodayBtn",
  "calLegendPro",
  "calScaleToggle",
  "calLegendHint",
  "calLegendCrown",
  "calLevelClear",
  "calGrid",
  "calMonthMeta",
  "calMonthStatsBox",
  "calMonthStatsGrid",
  "calMonthCompare",
  "calRecordCard",
  "calDayHead",
  "calDayTitle",
  "calDaySummary",
  "calDayFilters",
  "calDayList",
  "calDayEmpty",
  "calMonthTopTitle",
  "calMonthImgBtn",
  "calMonthPlaylistBtn",
  "calMonthTopList",
  "calMonthTopEmpty",
  "calMonthChannelsBox",
  "calMonthChannelsTitle",
  "calMonthChannelsList",
  "calMonthCatsBox",
  "calMonthCatsTitle",
  "calMonthCatsList",
  "calWeekdayBox",
  "calWeekdayChart",
  "calMonthSocialBox",
  "calMonthSocialTitle",
  "calMonthSocialList",
  "calWeeksTitle",
  "calWeeksList",
  "calYearLabel",
  "calYearPrevBtn",
  "calYearNextBtn",
  "calYearZoom",
  "calYearStats",
  "calYearHeatmapScroll",
  "calYearMonths",
  "calYearDays",
  "calYearGrid",
  "calYearMonthsGrid",
];
