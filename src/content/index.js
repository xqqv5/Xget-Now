if (typeof webext === "undefined") {
  console.error("Xget Now content script: compatibility layer missing");
}

const core = globalThis.XgetDownloadCore;
let liveSettings = null;

async function getSettings() {
  const settings = await new Promise((resolve) => {
    webext.runtime.sendMessage({ action: "getSettings" }, resolve);
  });

  return core.normalizeSettings(settings);
}

function shouldHandleCurrentPage(settings) {
  const currentPlatform = core.detectPlatform(window.location.href);
  return (
    Boolean(currentPlatform) &&
    settings.enabled &&
    Boolean(settings.activeDomain) &&
    settings.enabledPlatforms[currentPlatform]
  );
}

function createSyntheticLink(url, sourceLink) {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener noreferrer";
  link.target = sourceLink && sourceLink.target ? sourceLink.target : "_blank";

  if (sourceLink && (sourceLink.download || sourceLink.hasAttribute("download"))) {
    link.download = sourceLink.download || "";
  }

  link.style.display = "none";
  return link;
}

function openViaSyntheticLink(url, sourceLink) {
  const link = createSyntheticLink(url, sourceLink);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function showNotification(message, showRefreshButton) {
  const existing = document.querySelectorAll(".xget-notification");
  existing.forEach((node) => node.remove());

  const notification = document.createElement("div");
  notification.className = "xget-notification";
  notification.style.cssText = [
    "position: fixed",
    "top: 20px",
    "right: 20px",
    "z-index: 2147483647",
    "max-width: 280px",
    "padding: 12px 14px",
    "border-radius: 10px",
    "box-shadow: 0 10px 24px rgba(15, 23, 42, 0.2)",
    "background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
    "color: #eff6ff",
    "font: 13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  ].join("; ");

  const text = document.createElement("div");
  text.textContent = String(message);
  notification.appendChild(text);

  if (showRefreshButton) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Refresh";
    button.style.cssText = [
      "margin-top: 8px",
      "border: 0",
      "border-radius: 8px",
      "padding: 6px 8px",
      "background: rgba(255, 255, 255, 0.18)",
      "color: inherit",
      "cursor: pointer",
    ].join("; ");
    button.addEventListener("click", () => window.location.reload());
    notification.appendChild(button);
  }

  document.documentElement.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, showRefreshButton ? 8000 : 3000);
}

async function handleClick(event) {
  const link = event.target && event.target.closest
    ? event.target.closest("a[href]")
    : null;
  if (!link) {
    return;
  }

  const settings = liveSettings || (await getSettings());
  liveSettings = settings;

  if (!shouldHandleCurrentPage(settings)) {
    return;
  }

  const platformKey = core.detectPlatform(link.href);
  if (!platformKey || !settings.enabledPlatforms[platformKey]) {
    return;
  }

  if (core.shouldBypassClick(event, link)) {
    return;
  }

  if (
    !core.isDownloadCandidate(link.href, {
      hasDownloadAttribute: Boolean(link.download || link.hasAttribute("download")),
      linkText: link.textContent || "",
    })
  ) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
  }

  const redirectedUrl = core.transformDownloadUrl(link.href, settings);
  if (!redirectedUrl || redirectedUrl === link.href) {
    showNotification("Unable to rewrite this URL. Opening the original link.");
    openViaSyntheticLink(link.href, link);
    return;
  }

  showNotification("Download redirected via Xget");
  openViaSyntheticLink(redirectedUrl, link);
}

(async function init() {
  liveSettings = await getSettings();

  if (!shouldHandleCurrentPage(liveSettings)) {
    return;
  }

  document.addEventListener("click", handleClick, true);

  webext.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "showNotification") {
      showNotification(request.message, request.showRefreshButton);
      sendResponse({ success: true });
    }
  });
})();
