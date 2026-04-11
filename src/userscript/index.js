(function () {
  const core = globalThis.XgetDownloadCore;
  if (!core) {
    console.error("Xget Now userscript: shared core missing");
    return;
  }

  const STORAGE_KEY = "xget_now_userscript_settings";
  const PROBE_CACHE_MS = 5 * 60 * 1000;
  const state = {
    settings: loadSettings(),
    probeCache: {},
    toastTimer: null,
  };

  registerMenuCommands();
  document.addEventListener("click", onDocumentClick, true);

  function loadSettings() {
    return core.normalizeSettings(
      typeof GM_getValue === "function" ? GM_getValue(STORAGE_KEY, null) : null,
      { mode: "userscript" }
    );
  }

  function saveSettings(nextSettings) {
    state.settings = core.normalizeSettings(nextSettings, { mode: "userscript" });
    GM_setValue(STORAGE_KEY, state.settings);
    return state.settings;
  }

  function registerMenuCommands() {
    if (typeof GM_registerMenuCommand !== "function") {
      return;
    }

    GM_registerMenuCommand(
      state.settings.enabled ? "Disable Xget Now" : "Enable Xget Now",
      () => {
        const settings = saveSettings({
          ...state.settings,
          enabled: !state.settings.enabled,
        });
        showToast(
          settings.enabled ? "Xget Now userscript enabled" : "Xget Now userscript disabled"
        );
      }
    );

    GM_registerMenuCommand("Open Xget Now Settings", () => {
      openSettingsModal();
    });

    GM_registerMenuCommand("Test Current Xget Node", async () => {
      const activeProfile = getActiveProfile(state.settings);
      if (!activeProfile) {
        showToast("No active Xget profile configured", "error");
        return;
      }

      showToast(`Testing ${activeProfile.domain}...`, "info");
      const available = await probeDomain(activeProfile.domain, true);
      showToast(
        available
          ? `${activeProfile.domain} is reachable`
          : `${activeProfile.domain} is unavailable`,
        available ? "success" : "error"
      );
    });
  }

  function getActiveProfile(settings) {
    return (settings.profiles || []).find(
      (profile) => profile.id === settings.activeProfileId
    );
  }

  async function probeDomain(domain, force) {
    const normalizedDomain = core.sanitizeDomain(domain);
    if (!normalizedDomain) {
      return false;
    }

    const cached = state.probeCache[normalizedDomain];
    if (
      !force &&
      cached &&
      Date.now() - cached.checkedAt < PROBE_CACHE_MS
    ) {
      return cached.available;
    }

    const available = await new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };

      try {
        GM_xmlhttpRequest({
          method: "GET",
          url: `https://${normalizedDomain}/gh/robots.txt`,
          headers: {
            Range: "bytes=0-0",
            "Cache-Control": "no-cache",
          },
          timeout: 3000,
          onload: (response) => {
            finish(
              response.status === 206 ||
                (response.status >= 200 && response.status < 400)
            );
          },
          onerror: () => finish(false),
          ontimeout: () => finish(false),
        });
      } catch (error) {
        finish(false);
      }
    });

    state.probeCache[normalizedDomain] = {
      available,
      checkedAt: Date.now(),
    };
    return available;
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

  async function onDocumentClick(event) {
    const link = event.target && event.target.closest
      ? event.target.closest("a[href]")
      : null;
    if (!link) {
      return;
    }

    const settings = state.settings;
    if (!settings.enabled) {
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

    const activeProfile = getActiveProfile(settings);
    if (!activeProfile) {
      showToast("No active Xget profile configured", "error");
      openViaSyntheticLink(link.href, link);
      return;
    }

    if (settings.autoProbe) {
      const available = await probeDomain(activeProfile.domain);
      if (!available) {
        showToast(
          `${activeProfile.domain} is unavailable. Falling back to the original link.`,
          "error"
        );
        openViaSyntheticLink(link.href, link);
        return;
      }
    }

    const acceleratedUrl = core.transformDownloadUrl(link.href, settings);
    if (!acceleratedUrl || acceleratedUrl === link.href) {
      showToast("Unable to rewrite this link. Falling back to the original URL.", "error");
      openViaSyntheticLink(link.href, link);
      return;
    }

    if (settings.showNotifications) {
      showToast(`Redirecting download via ${activeProfile.domain}`, "success");
    }

    openViaSyntheticLink(acceleratedUrl, link);
  }

  function ensureToastContainer() {
    let container = document.getElementById("xget-now-userscript-toast");
    if (container) {
      return container;
    }

    container = document.createElement("div");
    container.id = "xget-now-userscript-toast";
    container.style.cssText = [
      "position: fixed",
      "top: 20px",
      "right: 20px",
      "z-index: 2147483647",
      "max-width: 320px",
      "padding: 12px 14px",
      "border-radius: 10px",
      "box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18)",
      "font: 13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "background: #0f172a",
      "color: #f8fafc",
      "opacity: 0",
      "transform: translateY(-8px)",
      "transition: opacity 120ms ease, transform 120ms ease",
      "pointer-events: none",
    ].join("; ");
    document.documentElement.appendChild(container);
    return container;
  }

  function showToast(message, type) {
    if (!state.settings.showNotifications && type !== "error" && type !== "info") {
      return;
    }

    const container = ensureToastContainer();
    container.textContent = String(message);

    const palette = {
      success: { background: "#0f766e", color: "#f0fdfa" },
      error: { background: "#991b1b", color: "#fef2f2" },
      info: { background: "#1d4ed8", color: "#eff6ff" },
    };
    const colors = palette[type] || palette.success;
    container.style.background = colors.background;
    container.style.color = colors.color;
    container.style.opacity = "1";
    container.style.transform = "translateY(0)";

    if (state.toastTimer) {
      clearTimeout(state.toastTimer);
    }

    state.toastTimer = setTimeout(() => {
      container.style.opacity = "0";
      container.style.transform = "translateY(-8px)";
    }, type === "error" ? 5000 : 2500);
  }

  function createSwitch(label, checked) {
    const wrapper = document.createElement("label");
    wrapper.style.cssText =
      "display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 0; cursor:pointer;";

    const text = document.createElement("span");
    text.textContent = label;
    text.style.cssText = "font-size:13px; color:#0f172a;";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;

    wrapper.append(text, input);
    return { wrapper, input };
  }

  function createProfileRow(profile, isActive) {
    const row = document.createElement("div");
    row.className = "xget-profile-row";
    row.dataset.profileId = profile.id;
    row.style.cssText =
      "display:grid; grid-template-columns: 18px minmax(0, 1fr) minmax(0, 1fr) auto; gap:10px; align-items:center; margin-bottom:8px;";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "xget-active-profile";
    radio.checked = isActive;
    radio.value = profile.id;

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = profile.name;
    nameInput.placeholder = "Profile name";
    nameInput.style.cssText = profileInputStyles();
    nameInput.dataset.field = "name";

    const domainInput = document.createElement("input");
    domainInput.type = "text";
    domainInput.value = profile.domain;
    domainInput.placeholder = "xget.example.com";
    domainInput.style.cssText = profileInputStyles();
    domainInput.dataset.field = "domain";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.style.cssText =
      "border:0; border-radius:8px; background:#fee2e2; color:#991b1b; padding:8px 10px; cursor:pointer;";
    deleteButton.addEventListener("click", () => {
      const list = row.parentElement;
      row.remove();
      const remainingRows = list.querySelectorAll(".xget-profile-row");
      if (remainingRows.length > 0 && !list.querySelector('input[type="radio"]:checked')) {
        remainingRows[0].querySelector('input[type="radio"]').checked = true;
      }
    });

    row.append(radio, nameInput, domainInput, deleteButton);
    return row;
  }

  function profileInputStyles() {
    return [
      "width:100%",
      "border:1px solid #cbd5e1",
      "border-radius:8px",
      "padding:8px 10px",
      "font-size:13px",
      "box-sizing:border-box",
    ].join("; ");
  }

  function createSectionTitle(text) {
    const title = document.createElement("h3");
    title.textContent = text;
    title.style.cssText =
      "margin:0 0 12px; font-size:14px; font-weight:700; color:#0f172a;";
    return title;
  }

  function createPlatformGrid(settings) {
    const grid = document.createElement("div");
    grid.style.cssText =
      "display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:8px;";

    core.CORE_USERSCRIPT_PLATFORM_KEYS.forEach((platformKey) => {
      const platform = core.PLATFORM_DEFINITIONS[platformKey];
      const switchView = createSwitch(
        platform ? platform.name : platformKey,
        Boolean(settings.enabledPlatforms[platformKey])
      );
      switchView.input.dataset.platformKey = platformKey;
      switchView.wrapper.style.borderBottom = "1px solid #e2e8f0";
      grid.appendChild(switchView.wrapper);
    });

    return grid;
  }

  function collectProfiles(profileList) {
    return Array.from(profileList.querySelectorAll(".xget-profile-row"))
      .map((row) => {
        const radio = row.querySelector('input[type="radio"]');
        const name = row.querySelector('input[data-field="name"]').value;
        const domain = row.querySelector('input[data-field="domain"]').value;
        const id = row.dataset.profileId || crypto.randomUUID();

        return {
          id,
          name: String(name || "").trim() || "Unnamed profile",
          domain: core.sanitizeDomain(domain),
          active: Boolean(radio && radio.checked),
        };
      })
      .filter((profile) => profile.domain);
  }

  function openSettingsModal() {
    const existing = document.getElementById("xget-now-userscript-modal");
    if (existing) {
      existing.remove();
    }

    const overlay = document.createElement("div");
    overlay.id = "xget-now-userscript-modal";
    overlay.style.cssText = [
      "position: fixed",
      "inset: 0",
      "z-index: 2147483646",
      "background: rgba(15, 23, 42, 0.45)",
      "display: flex",
      "justify-content: center",
      "align-items: center",
      "padding: 20px",
    ].join("; ");

    const panel = document.createElement("div");
    panel.style.cssText = [
      "width: min(900px, 100%)",
      "max-height: min(90vh, 840px)",
      "overflow: auto",
      "background: #ffffff",
      "border-radius: 16px",
      "padding: 20px",
      "box-shadow: 0 30px 80px rgba(15, 23, 42, 0.25)",
      "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    ].join("; ");

    const header = document.createElement("div");
    header.style.cssText =
      "display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:18px;";

    const title = document.createElement("h2");
    title.textContent = "Xget Now Userscript Settings";
    title.style.cssText = "margin:0; font-size:18px; color:#0f172a;";

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.style.cssText =
      "border:0; border-radius:8px; background:#e2e8f0; color:#0f172a; padding:10px 12px; cursor:pointer;";
    close.addEventListener("click", () => overlay.remove());

    header.append(title, close);
    panel.appendChild(header);

    const togglesSection = document.createElement("section");
    togglesSection.style.marginBottom = "18px";
    togglesSection.appendChild(createSectionTitle("General"));
    const enabledSwitch = createSwitch("Enable Xget Now", state.settings.enabled);
    const notificationSwitch = createSwitch(
      "Show notifications",
      state.settings.showNotifications
    );
    const autoProbeSwitch = createSwitch(
      "Probe node before redirecting downloads",
      state.settings.autoProbe
    );
    togglesSection.append(
      enabledSwitch.wrapper,
      notificationSwitch.wrapper,
      autoProbeSwitch.wrapper
    );
    panel.appendChild(togglesSection);

    const profilesSection = document.createElement("section");
    profilesSection.style.marginBottom = "18px";
    profilesSection.appendChild(createSectionTitle("Xget Nodes"));

    const profileList = document.createElement("div");
    state.settings.profiles.forEach((profile) => {
      profileList.appendChild(
        createProfileRow(profile, profile.id === state.settings.activeProfileId)
      );
    });
    profilesSection.appendChild(profileList);

    const addProfile = document.createElement("button");
    addProfile.type = "button";
    addProfile.textContent = "Add node";
    addProfile.style.cssText =
      "border:0; border-radius:8px; background:#dbeafe; color:#1d4ed8; padding:10px 12px; cursor:pointer;";
    addProfile.addEventListener("click", () => {
      const profile = {
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `profile-${Date.now()}`,
        name: "",
        domain: "",
      };
      profileList.appendChild(
        createProfileRow(profile, profileList.children.length === 0)
      );
    });
    profilesSection.appendChild(addProfile);
    panel.appendChild(profilesSection);

    const probeRow = document.createElement("div");
    probeRow.style.cssText =
      "display:flex; align-items:center; gap:12px; margin: 14px 0 20px;";

    const probeButton = document.createElement("button");
    probeButton.type = "button";
    probeButton.textContent = "Test selected node";
    probeButton.style.cssText =
      "border:0; border-radius:8px; background:#0f766e; color:#f0fdfa; padding:10px 12px; cursor:pointer;";

    const probeResult = document.createElement("span");
    probeResult.style.cssText = "font-size:13px; color:#334155;";

    probeButton.addEventListener("click", async () => {
      const profiles = collectProfiles(profileList);
      const active = profiles.find((profile) => profile.active);
      if (!active) {
        probeResult.textContent = "Select a node first";
        return;
      }

      probeResult.textContent = `Testing ${active.domain}...`;
      const available = await probeDomain(active.domain, true);
      probeResult.textContent = available
        ? `${active.domain} is reachable`
        : `${active.domain} is unavailable`;
    });

    probeRow.append(probeButton, probeResult);
    panel.appendChild(probeRow);

    const platformsSection = document.createElement("section");
    platformsSection.style.marginBottom = "20px";
    platformsSection.appendChild(createSectionTitle("Platforms"));
    platformsSection.appendChild(createPlatformGrid(state.settings));
    panel.appendChild(platformsSection);

    const footer = document.createElement("div");
    footer.style.cssText =
      "display:flex; justify-content:flex-end; gap:12px; border-top:1px solid #e2e8f0; padding-top:16px;";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    cancelButton.style.cssText =
      "border:0; border-radius:8px; background:#e2e8f0; color:#0f172a; padding:10px 12px; cursor:pointer;";
    cancelButton.addEventListener("click", () => overlay.remove());

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save";
    saveButton.style.cssText =
      "border:0; border-radius:8px; background:#1d4ed8; color:#eff6ff; padding:10px 12px; cursor:pointer;";
    saveButton.addEventListener("click", () => {
      const profiles = collectProfiles(profileList);
      if (profiles.length === 0) {
        showToast("Add at least one valid Xget node before saving.", "error");
        return;
      }

      const activeProfile = profiles.find((profile) => profile.active) || profiles[0];
      const enabledPlatforms = { ...state.settings.enabledPlatforms };
      panel
        .querySelectorAll("input[data-platform-key]")
        .forEach((input) => {
          enabledPlatforms[input.dataset.platformKey] = input.checked;
        });

      saveSettings({
        enabled: enabledSwitch.input.checked,
        showNotifications: notificationSwitch.input.checked,
        autoProbe: autoProbeSwitch.input.checked,
        activeProfileId: activeProfile.id,
        profiles: profiles.map(({ active, ...profile }) => profile),
        enabledPlatforms,
      });

      overlay.remove();
      showToast("Xget Now userscript settings saved", "success");
    });

    footer.append(cancelButton, saveButton);
    panel.appendChild(footer);

    overlay.appendChild(panel);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        overlay.remove();
      }
    });

    document.documentElement.appendChild(overlay);
  }
})();
