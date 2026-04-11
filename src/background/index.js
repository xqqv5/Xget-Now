if (typeof importScripts !== "undefined") {
  try {
    importScripts("webext-compat.js", "download-core.js");
  } catch (error) {
    console.log("Background dependencies already loaded by the browser");
  }
}

if (typeof webext === "undefined") {
  if (typeof browser !== "undefined") {
    self.webext = browser;
    self.webextFlavor = { soup: new Set(["firefox"]) };
  } else if (typeof chrome !== "undefined") {
    self.webext = chrome;
    self.webextFlavor = { soup: new Set(["chromium"]) };
  }
}

const core = self.XgetDownloadCore;
const DEFAULT_SETTINGS = core.normalizeSettings(core.DEFAULT_EXTENSION_SETTINGS);

function getStorageAPI() {
  const isFirefox =
    typeof webextFlavor !== "undefined" &&
    webextFlavor.soup &&
    webextFlavor.soup.has("firefox");

  return isFirefox ? webext.storage.local : webext.storage.sync || webext.storage.local;
}

async function getSettings() {
  const storageAPI = getStorageAPI();
  const rawSettings = await storageAPI.get(DEFAULT_SETTINGS);
  return core.normalizeSettings(rawSettings);
}

async function setSettings(nextSettings) {
  const storageAPI = getStorageAPI();
  const normalized = core.normalizeSettings(nextSettings);
  await storageAPI.set(normalized);
  return normalized;
}

async function notifyMatchingTabs(message, showRefreshButton) {
  try {
    const tabs = await webext.tabs.query({
      url: core.getMatchPatterns(),
    });

    await Promise.all(
      tabs.map(async (tab) => {
        try {
          await webext.tabs.sendMessage(tab.id, {
            action: "showNotification",
            message,
            showRefreshButton,
          });
        } catch (error) {
          return null;
        }
      })
    );
  } catch (error) {
    console.log("Unable to notify tabs about settings changes");
  }
}

async function processDownloadRedirect(downloadItem) {
  const settings = await getSettings();
  if (!settings.enabled || !settings.activeDomain) {
    return;
  }

  const redirectedUrl = core.transformDownloadUrl(downloadItem.url, settings);
  if (!redirectedUrl || redirectedUrl === downloadItem.url) {
    return;
  }

  await webext.downloads.cancel(downloadItem.id);
  await webext.downloads.download({
    url: redirectedUrl,
    filename: downloadItem.filename || undefined,
    conflictAction: "uniquify",
  });

  if (typeof downloadItem.tabId === "number") {
    try {
      await webext.tabs.sendMessage(downloadItem.tabId, {
        action: "showNotification",
        message: "Download redirected via Xget",
        showRefreshButton: false,
      });
    } catch (error) {
      return null;
    }
  }
}

function handleDownload(downloadItem, suggest) {
  suggest();
  processDownloadRedirect(downloadItem).catch((error) => {
    console.error("Failed to redirect browser download", error);
  });
}

const messageListener = (request, sender, sendResponse) => {
  if (request.action === "getSettings") {
    getSettings()
      .then((settings) => sendResponse(settings))
      .catch((error) => {
        console.error("Failed to load settings", error);
        sendResponse(DEFAULT_SETTINGS);
      });
    return true;
  }

  if (request.action === "saveSettings") {
    setSettings(request.settings || {})
      .then(async (settings) => {
        await notifyMatchingTabs("Settings updated. Refresh the page to use them.", true);
        sendResponse({ success: true, settings });
      })
      .catch((error) => {
        console.error("Failed to save settings", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  return false;
};

webext.runtime.onInstalled.addListener(async () => {
  try {
    const settings = await getSettings();
    await setSettings(settings);
  } catch (error) {
    console.error("Failed to initialize extension settings", error);
  }
});

if (webext.downloads && webext.downloads.onDeterminingFilename) {
  webext.downloads.onDeterminingFilename.addListener(handleDownload);
}

if (webext.runtime && webext.runtime.onMessage) {
  webext.runtime.onMessage.addListener(messageListener);
}
