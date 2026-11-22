// src/cardRenderer.js

import { formatDuration } from "./utils.js";

async function loadImageBitmapSafe(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob());
  } catch {
    return null;
  }
}

function drawCoverRounded(ctx, bitmap, x, y, w, h, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.clip();

  if (bitmap) {
    const { width: sw, height: sh } = bitmap;
    const srcRatio = sw / sh;
    const dstRatio = w / h;
    let sx = 0,
      sy = 0,
      cw = sw,
      ch = sh;
    if (srcRatio > dstRatio) {
      cw = sh * dstRatio;
      sx = (sw - cw) / 2;
    } else {
      ch = sw / dstRatio;
      sy = (sh - ch) / 2;
    }
    ctx.drawImage(bitmap, sx, sy, cw, ch, x, y, w, h);
  } else {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, "#3b1d2e");
    g.addColorStop(1, "#1e2238");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

function fitCanvasText(ctx, text, maxWidth) {
  const str = String(text || "");
  if (ctx.measureText(str).width <= maxWidth) return str;
  let out = str;
  while (out.length > 1 && ctx.measureText(out + "…").width > maxWidth) {
    out = out.slice(0, -1);
  }
  return out + "…";
}

export async function renderRecapPngBlob(cardData) {
  if (!cardData || cardData.topTracks.length === 0) return null;

  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#120c14");
  bg.addColorStop(0.5, "#0d0d12");
  bg.addColorStop(1, "#160e16");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow1 = ctx.createRadialGradient(180, 180, 20, 180, 180, 460);
  glow1.addColorStop(0, "rgba(255, 78, 69, 0.28)");
  glow1.addColorStop(1, "rgba(255, 78, 69, 0)");
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(920, 1100, 20, 920, 1100, 520);
  glow2.addColorStop(0, "rgba(255, 153, 204, 0.22)");
  glow2.addColorStop(1, "rgba(255, 153, 204, 0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  const bitmaps = await Promise.all(
    cardData.topTracks.map((t) => loadImageBitmapSafe(t.artwork)),
  );

  ctx.fillStyle = "#ff85b3";
  ctx.font = "700 26px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("YOUTUBE & YT MUSIC RECAP", 72, 92);

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 58px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(fitCanvasText(ctx, cardData.subtitle, W - 144), 72, 162);

  const top1 = cardData.topTracks[0];
  ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(72, 204, W - 144, 290, 28);
  ctx.fill();
  ctx.stroke();

  drawCoverRounded(ctx, bitmaps[0], 102, 234, 230, 230, 20);

  ctx.fillStyle = "#ff6b63";
  ctx.font = "700 22px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("#1 MÁS REPRODUCIDO", 362, 276);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 38px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(fitCanvasText(ctx, top1.title, 610), 362, 334);

  ctx.fillStyle = "#bbbbcc";
  ctx.font = "500 28px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(fitCanvasText(ctx, top1.artist, 610), 362, 382);

  const top1Mins =
    top1.seconds > 0
      ? `${Math.max(1, Math.round(top1.seconds / 60))} min`
      : "Importado";
  ctx.fillStyle = "#86efac";
  ctx.font = "600 24px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(
    `${top1.plays}x reproducciones${top1.loops > 0 ? ` · 🔁 ${top1.loops} bucles` : ""} · ${top1Mins}`,
    362,
    438,
  );

  const kpis = [
    ["TIEMPO TOTAL", formatDuration(cardData.totalSeconds)],
    ["REPRODUCCIONES", String(cardData.totalPlays)],
    ["BUCLES", `🔁 ${cardData.totalLoops}`],
  ];
  const kpiW = (W - 144 - 32) / 3;
  kpis.forEach(([label, val], idx) => {
    const kx = 72 + idx * (kpiW + 16);
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    ctx.beginPath();
    ctx.roundRect(kx, 524, kpiW, 118, 20);
    ctx.fill();

    ctx.fillStyle = "#9ca3af";
    ctx.font = "600 20px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(label, kx + 24, 566);

    ctx.fillStyle = "#ffffff";
    ctx.font = "800 38px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(val, kx + 24, 616);
  });

  ctx.fillStyle = "#d1d5db";
  ctx.font = "700 26px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("TOP DEL PERÍODO", 72, 704);

  cardData.topTracks.slice(1, 5).forEach((track, i) => {
    const rowY = 730 + i * 112;
    ctx.fillStyle = "rgba(255, 255, 255, 0.045)";
    ctx.beginPath();
    ctx.roundRect(72, rowY, W - 144, 96, 18);
    ctx.fill();

    ctx.fillStyle = "#9ca3af";
    ctx.font = "800 28px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(String(i + 2), 98, rowY + 58);

    drawCoverRounded(ctx, bitmaps[i + 1], 144, rowY + 14, 68, 68, 12);

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 26px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(fitCanvasText(ctx, track.title, 580), 232, rowY + 44);

    ctx.fillStyle = "#9ca3af";
    ctx.font = "500 22px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(fitCanvasText(ctx, track.artist, 580), 232, rowY + 76);

    const mins =
      track.seconds > 0
        ? `${Math.max(1, Math.round(track.seconds / 60))}m`
        : "Imp.";
    ctx.fillStyle = "#e5e7eb";
    ctx.font = "700 22px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(
      `${track.plays}x${track.loops > 0 ? ` (🔁${track.loops})` : ""} · ${mins}`,
      W - 98,
      rowY + 56,
    );
    ctx.textAlign = "left";
  });

  ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
  ctx.beginPath();
  ctx.roundRect(72, 1200, W - 144, 86, 20);
  ctx.fill();

  ctx.fillStyle = "#9ca3af";
  ctx.font = "600 20px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("ARTISTA / CANAL TOP", 100, 1236);

  ctx.fillStyle = "#ff99cc";
  ctx.font = "700 28px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(fitCanvasText(ctx, cardData.topArtist, 580), 100, 1268);

  ctx.fillStyle = "#6b7280";
  ctx.font = "600 20px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("Tu Recap · Chrome", W - 100, 1252);
  ctx.textAlign = "left";

  bitmaps.forEach((b) => b?.close());

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
