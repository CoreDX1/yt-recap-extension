// src/monogram.js

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function initials(name) {
  const parts = String(name || "?")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function monogramGradient(name) {
  const h = hash(String(name || "?"));
  const a = h % 360;
  const b = (a + 48 + (h % 40)) % 360;
  return `linear-gradient(140deg, hsl(${a} 62% 34%), hsl(${b} 58% 20%))`;
}

export function createMonogram(name, className = "") {
  const el = document.createElement("span");
  el.className = `monogram ${className}`.trim();
  el.style.background = monogramGradient(name);
  el.textContent = initials(name);
  el.setAttribute("aria-hidden", "true");
  return el;
}

export function attachImgFallback(img, name) {
  img.addEventListener(
    "error",
    () => {
      const mono = createMonogram(name, img.className);
      img.replaceWith(mono);
    },
    { once: true },
  );
}
