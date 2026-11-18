// src/calendarController.js
import { toDateKey } from "./utils.js";

export function bindCalendarControls(dom, uiState, rerender) {
  document.querySelectorAll(".cal-pill[data-calday]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".cal-pill[data-calday]")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      uiState.calDayMode = btn.dataset.calday;
      rerender();
    });
  });

  document.querySelectorAll(".cal-mode-btn[data-calview]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".cal-mode-btn[data-calview]")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      uiState.calViewMode = btn.dataset.calview;
      rerender();
    });
  });

  dom.calSearchInput.addEventListener("input", () => {
    uiState.calSearchQuery = dom.calSearchInput.value;
    rerender();
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
    rerender();
  });

  dom.calTodayBtn.addEventListener("click", () => {
    const today = new Date();
    uiState.calYear = today.getFullYear();
    uiState.calMonth = today.getMonth();
    uiState.selectedDateKey = toDateKey(today);
    rerender();
  });

  dom.calYearPrevBtn.addEventListener("click", () => {
    uiState.calYear -= 1;
    rerender();
  });

  dom.calYearNextBtn.addEventListener("click", () => {
    uiState.calYear += 1;
    rerender();
  });
}
