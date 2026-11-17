const YT_URLS = ["https://www.youtube.com/*", "https://music.youtube.com/*"];

chrome.runtime.onInstalled.addListener(async () => {
  const all = await chrome.storage.local.get(null);
  const oldNpKeys = Object.keys(all).filter((k) => k.startsWith("np_"));
  if (oldNpKeys.length > 0) {
    await chrome.storage.local.remove(oldNpKeys);
  }

  try {
    const tabs = await chrome.tabs.query({ url: YT_URLS });
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.scripting
        .executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        })
        .catch(() => {});
    }
  } catch {
    // Ignorar si no hay pestañas disponibles
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "GET_TAB_ID") {
    sendResponse({ tabId: sender.tab?.id ?? null });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove(`np_${tabId}`).catch(() => {});
});
