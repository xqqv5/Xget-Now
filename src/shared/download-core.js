(function (root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.XgetDownloadCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PLATFORM_DEFINITIONS = {
    gh: {
      base: "https://github.com",
      name: "GitHub",
      hosts: [
        "github.com",
        "raw.githubusercontent.com",
        "codeload.github.com",
        "objects.githubusercontent.com",
      ],
      downloadPatterns: [
        /\/releases\/download\//i,
        /\/archive\/.*\.(zip|tar\.gz|tar)$/i,
        /\/raw\//i,
        /\/zip\//i,
        /\/tar(\.gz)?\//i,
      ],
    },
    gl: {
      base: "https://gitlab.com",
      name: "GitLab",
      hosts: ["gitlab.com"],
      downloadPatterns: [/\/-\/archive\//i, /\/-\/releases\/.+\/downloads\//i],
    },
    gitea: {
      base: "https://gitea.com",
      name: "Gitea",
      hosts: ["gitea.com"],
      downloadPatterns: [/\/archive\//i, /\/raw\//i, /\/releases\/download\//i],
    },
    codeberg: {
      base: "https://codeberg.org",
      name: "Codeberg",
      hosts: ["codeberg.org"],
      downloadPatterns: [/\/archive\//i, /\/raw\//i, /\/releases\/download\//i],
    },
    sf: {
      base: "https://sourceforge.net",
      name: "SourceForge",
      hosts: ["sourceforge.net"],
      downloadPatterns: [/\/download$/i, /\/downloads\//i, /\/files\//i],
    },
    aosp: {
      base: "https://android.googlesource.com",
      name: "AOSP",
      hosts: ["android.googlesource.com"],
      downloadPatterns: [/\/\+archive\//i],
    },
    hf: {
      base: "https://huggingface.co",
      name: "Hugging Face",
      hosts: ["huggingface.co"],
      downloadPatterns: [/\/resolve\//i],
    },
    npm: {
      base: "https://registry.npmjs.org",
      name: "npm",
      hosts: ["registry.npmjs.org"],
      downloadPatterns: [/\/-\/.+\.tgz$/i],
    },
    pypi: {
      base: "https://pypi.org",
      name: "PyPI",
      hosts: ["pypi.org"],
      downloadPatterns: [/\/packages\//i],
    },
    "pypi-files": {
      base: "https://files.pythonhosted.org",
      name: "PyPI Files",
      hosts: ["files.pythonhosted.org"],
      downloadPatterns: [/\/packages\//i],
    },
    conda: {
      base: "https://repo.anaconda.com",
      name: "Conda",
      hosts: ["repo.anaconda.com"],
      downloadPatterns: [/\.(conda|tar\.bz2)$/i],
    },
    "conda-community": {
      base: "https://conda.anaconda.org",
      name: "Conda Community",
      hosts: ["conda.anaconda.org"],
      downloadPatterns: [/\.(conda|tar\.bz2)$/i],
    },
    maven: {
      base: "https://repo1.maven.org",
      name: "Maven Central",
      hosts: ["repo1.maven.org"],
      downloadPatterns: [/\.(jar|war|ear|pom|zip|tar\.gz)$/i],
    },
    apache: {
      base: "https://downloads.apache.org",
      name: "Apache Downloads",
      hosts: ["downloads.apache.org"],
      downloadPatterns: [/\.(zip|tar\.gz|tgz|bz2|xz)$/i],
    },
    gradle: {
      base: "https://plugins.gradle.org",
      name: "Gradle Plugin Portal",
      hosts: ["plugins.gradle.org"],
      downloadPatterns: [/\.(jar|zip)$/i],
    },
    rubygems: {
      base: "https://rubygems.org",
      name: "RubyGems",
      hosts: ["rubygems.org"],
      downloadPatterns: [/\.gem$/i],
    },
    cran: {
      base: "https://cran.r-project.org",
      name: "CRAN",
      hosts: ["cran.r-project.org"],
      downloadPatterns: [/\.(tar\.gz|zip)$/i],
    },
    cpan: {
      base: "https://www.cpan.org",
      name: "CPAN",
      hosts: ["www.cpan.org"],
      downloadPatterns: [/\.(tar\.gz|zip)$/i],
    },
    ctan: {
      base: "https://tug.ctan.org",
      name: "CTAN",
      hosts: ["tug.ctan.org"],
      downloadPatterns: [/\.(zip|tar\.xz|tar\.gz)$/i],
    },
    golang: {
      base: "https://proxy.golang.org",
      name: "Go Modules",
      hosts: ["proxy.golang.org"],
      downloadPatterns: [/\/@v\/.+\.(mod|zip|info)$/i],
    },
    nuget: {
      base: "https://api.nuget.org",
      name: "NuGet",
      hosts: ["api.nuget.org"],
      downloadPatterns: [/\.nupkg$/i],
    },
    crates: {
      base: "https://crates.io",
      name: "Crates.io",
      hosts: ["crates.io"],
      downloadPatterns: [/\/download$/i, /\.crate$/i],
    },
    packagist: {
      base: "https://repo.packagist.org",
      name: "Packagist",
      hosts: ["repo.packagist.org"],
      downloadPatterns: [/\.zip$/i],
    },
    arxiv: {
      base: "https://arxiv.org",
      name: "arXiv",
      hosts: ["arxiv.org"],
      downloadPatterns: [/\/pdf\//i, /\/e-print\//i],
    },
    fdroid: {
      base: "https://f-droid.org",
      name: "F-Droid",
      hosts: ["f-droid.org"],
      downloadPatterns: [/\.apk$/i, /\/FDroid\.apk$/i],
    },
  };

  const HOST_TO_PLATFORM = Object.entries(PLATFORM_DEFINITIONS).reduce(
    (map, [key, platform]) => {
      platform.hosts.forEach((host) => {
        map[host] = key;
      });
      return map;
    },
    {}
  );

  const CORE_USERSCRIPT_MATCHES = [
    "https://github.com/*",
    "https://raw.githubusercontent.com/*",
    "https://codeload.github.com/*",
    "https://objects.githubusercontent.com/*",
    "https://gitlab.com/*",
    "https://gitea.com/*",
    "https://codeberg.org/*",
    "https://sourceforge.net/*",
    "https://huggingface.co/*",
    "https://pypi.org/*",
    "https://files.pythonhosted.org/*",
    "https://registry.npmjs.org/*",
  ];

  const CORE_USERSCRIPT_PLATFORM_KEYS = [
    "gh",
    "gl",
    "gitea",
    "codeberg",
    "sf",
    "hf",
    "pypi",
    "pypi-files",
    "npm",
  ];

  const DOWNLOADABLE_EXTENSIONS = [
    ".zip",
    ".tar.gz",
    ".tar.bz2",
    ".tar.xz",
    ".tgz",
    ".7z",
    ".rar",
    ".gz",
    ".bz2",
    ".xz",
    ".exe",
    ".msi",
    ".dmg",
    ".pkg",
    ".deb",
    ".rpm",
    ".apk",
    ".jar",
    ".war",
    ".ear",
    ".iso",
    ".img",
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".mp4",
    ".avi",
    ".mkv",
    ".mov",
    ".wmv",
    ".mp3",
    ".wav",
    ".flac",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".svg",
    ".whl",
    ".egg",
    ".gem",
    ".nupkg",
    ".conda",
    ".crate",
    ".safetensors",
    ".bin",
    ".pt",
    ".pth",
    ".onnx",
    ".msgpack",
    ".tflite",
    ".h5",
  ];

  const DEFAULT_EXTENSION_SETTINGS = {
    enabled: true,
    xgetDomain: "xget.xi-xu.me",
    enabledPlatforms: Object.keys(PLATFORM_DEFINITIONS).reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {}),
  };

  const DEFAULT_USERSCRIPT_SETTINGS = {
    enabled: true,
    activeProfileId: "default",
    profiles: [
      { id: "default", name: "Xget Official", domain: "xget.xi-xu.me" },
    ],
    enabledPlatforms: Object.keys(PLATFORM_DEFINITIONS).reduce((acc, key) => {
      acc[key] = CORE_USERSCRIPT_PLATFORM_KEYS.includes(key);
      return acc;
    }, {}),
    showNotifications: true,
    autoProbe: true,
  };

  function sanitizeDomain(domain) {
    return String(domain || "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/g, "");
  }

  function getUrlObject(url) {
    try {
      return new URL(url);
    } catch (error) {
      return null;
    }
  }

  function detectPlatform(url) {
    const urlObject = getUrlObject(url);
    if (!urlObject) {
      return null;
    }

    return HOST_TO_PLATFORM[urlObject.hostname] || null;
  }

  function transformPath(path, platformKey) {
    if (platformKey !== "crates") {
      return path;
    }

    if (path === "/" || path.startsWith("/?")) {
      return path.replace("/", "/api/v1/crates");
    }

    return `/api/v1/crates${path}`;
  }

  function isKnownDownloadPattern(urlObject, platformKey) {
    const platform = PLATFORM_DEFINITIONS[platformKey];
    if (!platform) {
      return false;
    }

    if (platformKey === "gh" && urlObject.hostname !== "github.com") {
      return true;
    }

    return platform.downloadPatterns.some((pattern) =>
      pattern.test(urlObject.pathname)
    );
  }

  function hasDownloadableExtension(pathname) {
    const lowerPath = String(pathname || "").toLowerCase();
    return DOWNLOADABLE_EXTENSIONS.some((extension) =>
      lowerPath.endsWith(extension)
    );
  }

  function looksLikeExplicitDownloadText(linkText) {
    const normalized = String(linkText || "").trim().toLowerCase();
    return (
      normalized === "download" ||
      normalized === "download file" ||
      normalized === "get file" ||
      normalized.startsWith("download ")
    );
  }

  function isDownloadCandidate(url, context) {
    const details = context || {};
    const urlObject = getUrlObject(url);
    if (!urlObject) {
      return false;
    }

    const platformKey = detectPlatform(urlObject.href);
    if (!platformKey) {
      return false;
    }

    if (details.hasDownloadAttribute || details.downloadAttribute) {
      return true;
    }

    if (isKnownDownloadPattern(urlObject, platformKey)) {
      return true;
    }

    if (hasDownloadableExtension(urlObject.pathname)) {
      return true;
    }

    if (
      platformKey === "sf" &&
      (urlObject.searchParams.has("use_mirror") ||
        String(details.linkText || "").toLowerCase().includes("download"))
    ) {
      return true;
    }

    return looksLikeExplicitDownloadText(details.linkText);
  }

  function resolveActiveDomain(settings) {
    if (settings.activeDomain) {
      return sanitizeDomain(settings.activeDomain);
    }

    if (settings.xgetDomain) {
      return sanitizeDomain(settings.xgetDomain);
    }

    const profile = (settings.profiles || []).find(
      (item) => item.id === settings.activeProfileId
    );

    if (profile && profile.domain) {
      return sanitizeDomain(profile.domain);
    }

    const fallbackProfile = (settings.profiles || [])[0];
    return sanitizeDomain(fallbackProfile && fallbackProfile.domain);
  }

  function transformDownloadUrl(url, rawSettings) {
    const settings = normalizeSettings(rawSettings);
    const platformKey = detectPlatform(url);
    if (!platformKey || !settings.enabledPlatforms[platformKey]) {
      return null;
    }

    const activeDomain = resolveActiveDomain(settings);
    if (!activeDomain) {
      return null;
    }

    const urlObject = getUrlObject(url);
    if (!urlObject) {
      return null;
    }

    const transformedPath = transformPath(
      urlObject.pathname + urlObject.search + urlObject.hash,
      platformKey
    );

    return `https://${activeDomain}/${platformKey}${transformedPath}`;
  }

  function shouldBypassClick(event, link) {
    if (!event || !link || !link.href) {
      return true;
    }

    if (event.defaultPrevented) {
      return true;
    }

    if (event.button !== 0) {
      return true;
    }

    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return true;
    }

    const currentWindowName =
      typeof window !== "undefined" ? String(window.name || "") : "";

    if (
      link.target &&
      link.target !== "_self" &&
      link.target !== "" &&
      link.target !== currentWindowName
    ) {
      return true;
    }

    return false;
  }

  function normalizeProfiles(profiles) {
    const list = Array.isArray(profiles) ? profiles : [];
    const normalized = list
      .map((profile, index) => ({
        id: String(profile && profile.id ? profile.id : `profile-${index + 1}`),
        name: String(
          profile && profile.name ? profile.name : `Profile ${index + 1}`
        ).trim(),
        domain: sanitizeDomain(profile && profile.domain),
      }))
      .filter((profile) => profile.domain);

    if (normalized.length > 0) {
      return normalized;
    }

    return DEFAULT_USERSCRIPT_SETTINGS.profiles.map((profile) => ({ ...profile }));
  }

  function normalizeEnabledPlatforms(enabledPlatforms, mode) {
    const source = enabledPlatforms || {};
    const defaults =
      mode === "userscript"
        ? DEFAULT_USERSCRIPT_SETTINGS.enabledPlatforms
        : DEFAULT_EXTENSION_SETTINGS.enabledPlatforms;

    return Object.keys(DEFAULT_EXTENSION_SETTINGS.enabledPlatforms).reduce(
      (acc, key) => {
        acc[key] =
          typeof source[key] === "boolean" ? source[key] : defaults[key];
        return acc;
      },
      {}
    );
  }

  function normalizeSettings(rawSettings, options) {
    const opts = options || {};
    const input = rawSettings || {};
    const mode =
      opts.mode ||
      (Array.isArray(input.profiles) || Object.prototype.hasOwnProperty.call(input, "activeProfileId")
        ? "userscript"
        : "extension");

    if (mode === "userscript") {
      const profiles = normalizeProfiles(input.profiles);
      const activeProfileId =
        profiles.find((profile) => profile.id === input.activeProfileId)?.id ||
        profiles[0].id;
      const activeDomain = sanitizeDomain(
        input.activeDomain ||
          profiles.find((profile) => profile.id === activeProfileId)?.domain
      );

      return {
        enabled:
          typeof input.enabled === "boolean"
            ? input.enabled
            : DEFAULT_USERSCRIPT_SETTINGS.enabled,
        activeProfileId,
        profiles,
        enabledPlatforms: normalizeEnabledPlatforms(
          input.enabledPlatforms,
          "userscript"
        ),
        showNotifications:
          typeof input.showNotifications === "boolean"
            ? input.showNotifications
            : DEFAULT_USERSCRIPT_SETTINGS.showNotifications,
        autoProbe:
          typeof input.autoProbe === "boolean"
            ? input.autoProbe
            : DEFAULT_USERSCRIPT_SETTINGS.autoProbe,
        activeDomain,
      };
    }

    const xgetDomain = sanitizeDomain(input.xgetDomain);

    return {
      enabled:
        typeof input.enabled === "boolean"
          ? input.enabled
          : DEFAULT_EXTENSION_SETTINGS.enabled,
      xgetDomain: xgetDomain || DEFAULT_EXTENSION_SETTINGS.xgetDomain,
      enabledPlatforms: normalizeEnabledPlatforms(
        input.enabledPlatforms,
        "extension"
      ),
      activeDomain: xgetDomain || DEFAULT_EXTENSION_SETTINGS.xgetDomain,
    };
  }

  function getMatchPatterns(platformKeys) {
    const allowed = Array.isArray(platformKeys) && platformKeys.length > 0
      ? new Set(platformKeys)
      : null;

    return Object.entries(PLATFORM_DEFINITIONS).flatMap(([key, platform]) => {
      if (allowed && !allowed.has(key)) {
        return [];
      }

      return platform.hosts.map((host) => `https://${host}/*`);
    });
  }

  return {
    CORE_USERSCRIPT_MATCHES,
    CORE_USERSCRIPT_PLATFORM_KEYS,
    DEFAULT_EXTENSION_SETTINGS,
    DEFAULT_USERSCRIPT_SETTINGS,
    DOWNLOADABLE_EXTENSIONS,
    PLATFORM_DEFINITIONS,
    detectPlatform,
    getMatchPatterns,
    hasDownloadableExtension,
    isDownloadCandidate,
    normalizeSettings,
    sanitizeDomain,
    shouldBypassClick,
    transformDownloadUrl,
    transformPath,
  };
});
