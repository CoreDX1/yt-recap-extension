// src/calendarMarkup.js
// Fuente única del bloque de calendario: la inyectan popup.js y full.js.
export const CALENDAR_MARKUP = `
  <div class="cal-toolbar">
    <div class="cal-mode-switch">
      <button type="button" class="cal-mode-btn active" data-calview="month">Mes</button>
      <button type="button" class="cal-mode-btn" data-calview="year">Año</button>
    </div>
    <div class="cal-search-wrap">
      <input id="calSearchInput" type="search" class="cal-search-input" autocomplete="off" spellcheck="false" enterkeyhint="search" placeholder="🔍 Filtrar días por canal o tema..." />
    </div>
  </div>
  <div id="calSearchSummary" class="cal-search-summary" hidden></div>

  <div id="calMonthView">
    <section class="calendar-box">
      <div class="cal-header">
        <span id="calMonthLabel" class="cal-month-label">—</span>
        <div class="cal-nav">
          <button id="calTodayBtn" type="button" class="cal-today-btn" title="Ir a hoy">Hoy</button>
          <button id="calPrevBtn" type="button" class="cal-arrow-btn" aria-label="Mes anterior" title="Mes anterior"><span aria-hidden="true">‹</span></button>
          <button id="calNextBtn" type="button" class="cal-arrow-btn" aria-label="Mes siguiente" title="Mes siguiente"><span aria-hidden="true">›</span></button>
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
    </section>

    <section class="cal-section">
      <h2 id="calDayTitle">Actividad del día</h2>
      <div id="calDaySummary" class="cal-day-summary" hidden></div>
      <div id="calDayFilters" class="sub-pills compact-pills">
        <button type="button" class="cal-pill sub-pill active" data-calday="all">Todo</button>
        <button type="button" class="cal-pill sub-pill" data-calday="plays"><span aria-hidden="true">▶</span> Reprod.</button>
        <button type="button" class="cal-pill sub-pill" data-calday="likes"><span aria-hidden="true">❤️</span> Likes</button>
        <button type="button" class="cal-pill sub-pill" data-calday="subs"><span aria-hidden="true">🔔</span> Suscrip.</button>
        <button type="button" class="cal-pill sub-pill" data-calday="searches"><span aria-hidden="true">🔍</span> Búsquedas</button>
      </div>
      <ul id="calDayList" class="top-list compact"></ul>
      <p id="calDayEmpty" class="empty-msg small" hidden>No se registró actividad en esta fecha.</p>
    </section>

    <section class="cal-section">
      <div class="section-header">
        <h2 id="calMonthTopTitle">Top del mes</h2>
        <div class="section-actions">
          <button id="calMonthImgBtn" type="button" class="mini-btn" hidden title="Descargar tarjeta PNG del mes"><span aria-hidden="true">🖼️</span> PNG</button>
          <button id="calMonthPlaylistBtn" type="button" class="mini-btn" hidden title="Crear playlist del mes"><span aria-hidden="true">▶</span> Playlist</button>
        </div>
      </div>
      <ul id="calMonthTopList" class="top-list compact"></ul>
      <p id="calMonthTopEmpty" class="empty-msg small" hidden>Sin reproducciones en este mes.</p>
    </section>

    <section id="calMonthChannelsBox" class="activity-box" hidden>
      <h2 id="calMonthChannelsTitle"><span aria-hidden="true">⏱️</span> Top canales del mes</h2>
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
          <button id="calYearPrevBtn" type="button" class="cal-arrow-btn" aria-label="Año anterior" title="Año anterior"><span aria-hidden="true">‹</span></button>
          <button id="calYearNextBtn" type="button" class="cal-arrow-btn" aria-label="Año siguiente" title="Año siguiente"><span aria-hidden="true">›</span></button>
        </div>
      </div>
      <div id="calYearStats" class="cal-year-stats"></div>
      <div id="calYearHeatmapScroll" class="year-heatmap-scroll">
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
  "calMonthView",
  "calYearView",
  "calMonthLabel",
  "calPrevBtn",
  "calNextBtn",
  "calTodayBtn",
  "calGrid",
  "calMonthStatsBox",
  "calMonthStatsGrid",
  "calMonthCompare",
  "calDayTitle",
  "calDaySummary",
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
  "calYearStats",
  "calYearHeatmapScroll",
  "calYearGrid",
  "calYearMonthsGrid",
];
