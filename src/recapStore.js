// src/recapStore.js
import {
  computeIsMusicFlag,
  sanitizeFileSlug,
  getExtFromMime,
  toDateKey,
} from "./utils.js";
import { buildZipBlob, extractJsonFromZipBuffer } from "./zip.js";
import { importBackupPayload } from "./takeout.js";
import { renderRecapPngBlob } from "./cardRenderer.js";

export const STORE_KEYS = [
  "history",
  "channelVisits",
  "skips",
  "interactions",
  "searches",
];

export function emptyStore() {
  return {
    history: [],
    channelVisits: [],
    skips: [],
    interactions: [],
    searches: [],
  };
}

export async function loadStore() {
  const all = await chrome.storage.local.get(null);
  const store = emptyStore();
  for (const key of STORE_KEYS) {
    store[key] = Array.isArray(all[key]) ? all[key] : [];
  }
  return { store, all };
}

export function migrateMusicFlags(data) {
  let changed = false;
  const byVideo = new Map();
  const byTrack = new Map();

  for (const it of data.history) {
    const flag =
      it.source === "yt_music" ||
      it.isMusic === true ||
      computeIsMusicFlag(it.category, "", it.artist);
    if (flag && it.isMusic !== true) {
      it.isMusic = true;
      changed = true;
    }
    if (it.isMusic) {
      if (it.videoId) byVideo.set(it.videoId, true);
      if (it.trackKey) byTrack.set(it.trackKey, true);
    }
  }
  for (const sk of data.skips) {
    const flag =
      sk.isMusic === true ||
      computeIsMusicFlag(sk.category, "", sk.artist) ||
      (sk.videoId && byVideo.get(sk.videoId)) ||
      (sk.trackKey && byTrack.get(sk.trackKey));
    if (flag && sk.isMusic !== true) {
      sk.isMusic = true;
      changed = true;
    }
  }
  for (const it of data.interactions) {
    if (it.type !== "like") continue;
    const flag =
      it.isMusic === true ||
      computeIsMusicFlag(it.category, "", it.artist) ||
      (it.videoId && byVideo.get(it.videoId)) ||
      (it.targetKey && byTrack.get(it.targetKey));
    if (flag && it.isMusic !== true) {
      it.isMusic = true;
      changed = true;
    }
  }
  return changed;
}

export async function persistMusicFlags(store) {
  await chrome.storage.local.set({
    history: store.history,
    skips: store.skips,
    interactions: store.interactions,
  });
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportPngCard(cardData, btn) {
  if (!cardData || cardData.topTracks.length === 0) return;
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = "⏳...";
  try {
    const blob = await renderRecapPngBlob(cardData);
    if (!blob) return;
    downloadBlob(
      blob,
      `recap-${sanitizeFileSlug(cardData.subtitle)}-${toDateKey(new Date())}.png`,
    );
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

export async function buildExportZip(store, cardData, onProgress) {
  const imageTasks = [];
  const seenUrls = new Set();
  const usedNames = new Set();

  const queueImage = (url, folder, label) => {
    if (!url?.startsWith("http") || seenUrls.has(url)) return;
    seenUrls.add(url);
    const slug = sanitizeFileSlug(label);
    let unique = slug;
    let n = 2;
    while (usedNames.has(`${folder}/${unique}`)) unique = `${slug}-${n++}`;
    usedNames.add(`${folder}/${unique}`);
    imageTasks.push({ url, folder, slug: unique });
  };

  store.history.forEach((it) =>
    queueImage(it.artwork, "imagenes/portadas", it.videoId || it.title),
  );
  store.channelVisits.forEach((ch) =>
    queueImage(ch.avatar, "imagenes/canales", ch.name || ch.channelKey),
  );
  store.interactions.forEach((it) =>
    queueImage(
      it.artwork,
      it.type === "subscribe" ? "imagenes/canales" : "imagenes/portadas",
      it.title,
    ),
  );
  store.skips.forEach((sk) =>
    queueImage(sk.artwork, "imagenes/portadas", sk.videoId || sk.title),
  );

  const zipFiles = [];
  const imageMap = {};
  let done = 0;

  for (let i = 0; i < imageTasks.length; i += 6) {
    await Promise.all(
      imageTasks.slice(i, i + 6).map(async (task) => {
        try {
          const res = await fetch(task.url);
          if (!res.ok) return;
          const blob = await res.blob();
          const buf = new Uint8Array(await blob.arrayBuffer());
          const filePath = `${task.folder}/${task.slug}.${getExtFromMime(blob.type)}`;
          zipFiles.push({ name: filePath, data: buf });
          imageMap[task.url] = filePath;
        } catch {
          // Ignorar
        } finally {
          done += 1;
          onProgress?.(`⏳ ${done}/${imageTasks.length}`);
        }
      }),
    );
  }

  if (cardData) {
    const cardBlob = await renderRecapPngBlob(cardData);
    if (cardBlob) {
      zipFiles.push({
        name: "recap-tarjeta.png",
        data: new Uint8Array(await cardBlob.arrayBuffer()),
      });
    }
  }

  const payload = { exportedAt: new Date().toISOString(), ...store, imageMap };
  zipFiles.unshift({
    name: "recap-backup.json",
    data: new TextEncoder().encode(JSON.stringify(payload, null, 2)),
  });
  return buildZipBlob(zipFiles);
}

export async function importFromFile(file, store) {
  const isZip =
    file.name.toLowerCase().endsWith(".zip") || file.type.includes("zip");
  const parsed = isZip
    ? await extractJsonFromZipBuffer(await file.arrayBuffer())
    : JSON.parse(await file.text());
  return importBackupPayload(parsed, store);
}

const ENRICH_CONCURRENCY = 4;
const ENRICH_MAX_PER_RUN = 200;

export async function enrichImported(store, onProgress) {
  const candidates = [];
  const seen = new Set();
  const push = (it) => {
    if (
      it &&
      it.source === "youtube" &&
      !it.category &&
      !it.isMusic &&
      it.videoId &&
      !seen.has(it.videoId)
    ) {
      seen.add(it.videoId);
      candidates.push(it.videoId);
    }
  };
  store.history.forEach(push);
  store.skips.forEach(push);
  store.interactions.forEach((it) => it.type === "like" && push(it));

  if (candidates.length === 0) {
    return { updated: 0, consulted: 0, remaining: 0, none: true };
  }

  const batch = candidates.slice(0, ENRICH_MAX_PER_RUN);
  const remaining = candidates.length - batch.length;
  const results = new Map();
  let done = 0;

  for (let i = 0; i < batch.length; i += ENRICH_CONCURRENCY) {
    await Promise.all(
      batch.slice(i, i + ENRICH_CONCURRENCY).map(async (vid) => {
        try {
          const res = await fetch(
            `https://www.youtube.com/watch?v=${encodeURIComponent(vid)}`,
            { credentials: "omit" },
          );
          const html = res.ok ? await res.text() : "";
          const cat =
            html
              .match(/"category"\s*:\s*"([^"]+)"/)?.[1]
              ?.replace(/\\u0026/g, "&") || "";
          const mtype =
            html.match(/"musicVideoType"\s*:\s*"([^"]+)"/)?.[1] || "";
          results.set(vid, { cat, mtype });
        } catch {
          results.set(vid, { cat: "", mtype: "" });
        } finally {
          done += 1;
          onProgress?.(`⏳ ${done}/${batch.length}`);
        }
      }),
    );
  }

  let updated = 0;
  const apply = (it) => {
    if (!it || it.source !== "youtube" || !it.videoId) return;
    const r = results.get(it.videoId);
    if (!r || (!r.cat && !r.mtype)) return;
    let changed = false;
    if (r.cat && !it.category) {
      it.category = r.cat;
      changed = true;
    }
    if (
      computeIsMusicFlag(it.category, r.mtype, it.artist) &&
      it.isMusic !== true
    ) {
      it.isMusic = true;
      changed = true;
    }
    if (changed) updated += 1;
  };
  store.history.forEach(apply);
  store.skips.forEach(apply);
  store.interactions.forEach((it) => it.type === "like" && apply(it));

  return { updated, consulted: batch.length, remaining, none: false };
}

export class NowPlaying {
  constructor() {
    this.np = new Map();
    this.tabs = new Map();
  }

  async sync() {
    try {
      const allTabs = await chrome.tabs.query({});
      this.tabs.clear();
      for (const t of allTabs) {
        const u = t.url || t.pendingUrl || "";
        if (
          u.startsWith("https://www.youtube.com/") ||
          u.startsWith("https://music.youtube.com/")
        ) {
          this.tabs.set(t.id, t);
        }
      }
    } catch {
      // Ignorar si no hay permiso tabs
    }
  }

  loadInitial(all) {
    this.np.clear();
    const staleKeys = [];
    const now = Date.now();
    for (const [key, val] of Object.entries(all)) {
      if (!key.startsWith("np_") || !val) continue;
      if (key.startsWith("np_fb_")) {
        if (now - (val.updatedAt || 0) < 15000) this.np.set(key, val);
        else staleKeys.push(key);
      } else {
        const idPart = Number(key.slice(3));
        if (!Number.isInteger(idPart) || !this.tabs.has(idPart)) {
          staleKeys.push(key);
        } else {
          this.np.set(key, val);
        }
      }
    }
    return staleKeys;
  }

  applyChanges(changes) {
    let npChanged = false;
    let needSync = false;
    let dataChanged = false;
    const updates = {};
    for (const [key, change] of Object.entries(changes)) {
      if (key.startsWith("np_")) {
        if (change.newValue) {
          this.np.set(key, change.newValue);
          if (
            change.newValue.tabId != null &&
            !this.tabs.has(change.newValue.tabId)
          ) {
            needSync = true;
          }
        } else {
          this.np.delete(key);
        }
        npChanged = true;
      } else if (STORE_KEYS.includes(key)) {
        updates[key] = change.newValue || [];
        dataChanged = true;
      }
    }
    return { npChanged, needSync, dataChanged, updates };
  }

  removeTab(tabId) {
    this.tabs.delete(tabId);
    this.np.delete(`np_${tabId}`);
  }

  select(pinnedId) {
    const now = Date.now();
    const candidates = [...this.np.values()].filter((v) => {
      if (v.tabId != null) {
        if (!this.tabs.has(v.tabId)) return false;
        return v.paused
          ? now - v.updatedAt < 43200000
          : now - v.updatedAt < 90000;
      }
      return now - v.updatedAt < 15000;
    });
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
      if (a.paused !== b.paused) return a.paused ? 1 : -1;
      if (a.visible !== b.visible) return a.visible ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
    const pinned =
      pinnedId != null
        ? candidates.find((c) => (c.storageKey || c.tabId) === pinnedId)
        : null;
    const primary = pinned || candidates[0];
    const primaryKey = primary.storageKey || primary.tabId;
    const others = candidates.filter(
      (c) => (c.storageKey || c.tabId) !== primaryKey,
    );
    return { primary, others };
  }
}
