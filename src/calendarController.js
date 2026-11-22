// src/calendarController.js — controles, teclado, swipe, escala, zoom y rango.
import { toDateKey } from "./utils.js";

export function bindCalendarControls(dom, uiState, rerender) {
  const $ = (id) => document.getElementById(id);
  const grid = () => dom.calGrid;
  const focusKey = (key) => {
    const b = grid()?.querySelector(`[data-key="${key}"]`);
    if (b) b.focus();
    return Boolean(b);
  };
  const pulse = (key) => {
    const b = grid()?.querySelector(`[data-key="${key}"]`);
    if (!b) return;
    b.focus();
    b.classList.add("pulse");
    setTimeout(() => b.classList.remove("pulse"), 700);
  };

  // Delegación de clicks de celda (un solo listener para todo el mes).
  dom.calGrid?.addEventListener("click", (e) => {
    const btn = e.target.closest(".cal-day");
    if (!btn || !dom.calGrid.contains(btn)) return;
    const key = btn.dataset.key;
    if (!key) return;
    const other = btn.dataset.other === "1";
    const [y, m, d] = key.split("-").map(Number);
    if (e.shiftKey && uiState.selectedDateKey) {
      uiState.calRangeAnchor = uiState.selectedDateKey;
      uiState.calRangeEnd = key;
    } else {
      uiState.calRangeAnchor = null;
      uiState.calRangeEnd = null;
    }
    uiState.selectedDateKey = key;
    if (other) {
      uiState.calYear = y;
      uiState.calMonth = m - 1;
    }
    rerender();
  });

  document.querySelectorAll(".cal-pill[data-calday]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".cal-pill[data-calday]").forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      uiState.calDayMode = btn.dataset.calday;
      rerender();
    });
  });

  document.querySelectorAll(".cal-mode-btn[data-calview]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".cal-mode-btn[data-calview]").forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      uiState.calViewMode = btn.dataset.calview;
      rerender();
    });
  });

  let searchTimer = null;
  dom.calSearchInput.addEventListener("input", () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      uiState.calSearchQuery = dom.calSearchInput.value;
      rerender();
    }, 160);
  });

  dom.calPrevBtn.addEventListener("click", () => {
    uiState.calMonth -= 1;
    if (uiState.calMonth < 0) {
      uiState.calMonth = 11;
      uiState.calYear -= 1;
    }
    uiState.selectedDateKey = toDateKey(
      new Date(uiState.calYear, uiState.calMonth, 1),
    );
    uiState.calRangeAnchor = null;
    uiState.calRangeEnd = null;
    uiState.calWeekOpen = null;
    rerender();
  });

  dom.calNextBtn.addEventListener("click", () => {
    uiState.calMonth += 1;
    if (uiState.calMonth > 11) {
      uiState.calMonth = 0;
      uiState.calYear += 1;
    }
    uiState.selectedDateKey = toDateKey(
      new Date(uiState.calYear, uiState.calMonth, 1),
    );
    uiState.calRangeAnchor = null;
    uiState.calRangeEnd = null;
    uiState.calWeekOpen = null;
    rerender();
  });

  dom.calTodayBtn.addEventListener("click", () => {
    const today = new Date();
    uiState.calViewMode = "month";
    uiState.calYear = today.getFullYear();
    uiState.calMonth = today.getMonth();
    uiState.selectedDateKey = toDateKey(today);
    uiState.calRangeAnchor = null;
    uiState.calRangeEnd = null;
    uiState.calWeekOpen = null;
    document.querySelectorAll(".cal-mode-btn[data-calview]").forEach((b) => {
      b.classList.toggle("active", b.dataset.calview === "month");
    });
    rerender();
    pulse(uiState.selectedDateKey);
  });

  dom.calYearPrevBtn.addEventListener("click", () => {
    uiState.calYear -= 1;
    rerender();
  });
  dom.calYearNextBtn.addEventListener("click", () => {
    uiState.calYear += 1;
    rerender();
  });

  // --- escala relativa / absoluta ---
  const scaleWrap = dom.calScaleToggle || $("calScaleToggle");
  scaleWrap?.querySelectorAll("[data-calscale]").forEach((btn) => {
    btn.addEventListener("click", () => {
      uiState.calScale = btn.dataset.calscale;
      localStorage.setItem("recapCalScale", uiState.calScale);
      uiState.calLevelFilter = null;
      rerender();
    });
  });

  // --- leyenda: filtro por nivel ---
  const legend = dom.calLegendPro || $("calLegendPro");
  legend?.querySelectorAll("[data-callevel]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const n = Number(btn.dataset.callevel);
      uiState.calLevelFilter = uiState.calLevelFilter === n ? null : n;
      rerender();
    });
  });
  $("calLevelClear")?.addEventListener("click", () => {
    uiState.calLevelFilter = null;
    rerender();
  });

  // --- rango ---
  $("calRangeClear")?.addEventListener("click", () => {
    uiState.calRangeAnchor = null;
    uiState.calRangeEnd = null;
    rerender();
  });

  // --- zoom del mapa anual ---
  const zoomWrap = dom.calYearZoom || $("calYearZoom");
  zoomWrap?.querySelectorAll("[data-yrzoom]").forEach((btn) => {
    btn.addEventListener("click", () => {
      uiState.calYrZoom = Number(btn.dataset.yrzoom);
      localStorage.setItem("recapCalYrZoom", String(uiState.calYrZoom));
      rerender();
    });
  });

  // --- teclado sobre la grilla ---
  grid()?.addEventListener("keydown", (e) => {
    const cells = [...grid().querySelectorAll(".cal-day")];
    if (!cells.length) return;
    const active = document.activeElement?.closest?.(".cal-day");
    let idx = active
      ? cells.indexOf(active)
      : cells.findIndex((c) => c.getAttribute("aria-selected") === "true");
    if (idx < 0) idx = 0;
    const move = (n) => {
      const t = Math.max(0, Math.min(cells.length - 1, idx + n));
      const key = cells[t].dataset.key;
      e.preventDefault();
      cells[t].click();
      focusKey(key);
    };
    const pick = (node) => {
      if (!node) return;
      const key = node.dataset.key;
      e.preventDefault();
      node.click();
      focusKey(key);
    };
    switch (e.key) {
      case "ArrowLeft":
        move(-1);
        break;
      case "ArrowRight":
        move(1);
        break;
      case "ArrowUp":
        move(-7);
        break;
      case "ArrowDown":
        move(7);
        break;
      case "Home":
        pick(cells.find((c) => c.dataset.other === "0"));
        break;
      case "End":
        pick([...cells].reverse().find((c) => c.dataset.other === "0"));
        break;
      case "PageUp":
        e.preventDefault();
        dom.calPrevBtn.click();
        focusKey(uiState.selectedDateKey);
        break;
      case "PageDown":
        e.preventDefault();
        dom.calNextBtn.click();
        focusKey(uiState.selectedDateKey);
        break;
      case "Escape":
        if (
          uiState.calRangeAnchor ||
          uiState.calLevelFilter != null ||
          uiState.calWeekOpen != null
        ) {
          e.preventDefault();
          uiState.calRangeAnchor = null;
          uiState.calRangeEnd = null;
          uiState.calLevelFilter = null;
          uiState.calWeekOpen = null;
          rerender();
          focusKey(uiState.selectedDateKey);
        }
        break;
      default:
        break;
    }
  });

  // --- swipe horizontal en táctil ---
  let sx = 0,
    sy = 0,
    st = 0;
  grid()?.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    sx = e.clientX;
    sy = e.clientY;
    st = Date.now();
  });
  grid()?.addEventListener("pointerup", (e) => {
    if (e.pointerType !== "touch" || !st) return;
    const dx = e.clientX - sx,
      dy = e.clientY - sy,
      dt = Date.now() - st;
    st = 0;
    if (dt < 900 && Math.abs(dx) > 60 && Math.abs(dy) < 40) {
      (dx < 0 ? dom.calNextBtn : dom.calPrevBtn).click();
    }
  });
  grid()?.addEventListener("pointercancel", () => {
    st = 0;
  });
}
