const test = require("node:test");
const assert = require("node:assert/strict");

function loadCore() {
  try {
    return require("../../src/shared/download-core.js");
  } catch (error) {
    assert.fail(`download-core.js is not ready: ${error.message}`);
  }
}

test("detectPlatform recognizes GitHub helper hosts", () => {
  const core = loadCore();

  assert.equal(
    core.detectPlatform(
      "https://objects.githubusercontent.com/github-production-release-asset-2e65be/123/file.zip"
    ),
    "gh"
  );
  assert.equal(
    core.detectPlatform("https://codeload.github.com/owner/repo/zip/refs/tags/v1.0.0"),
    "gh"
  );
  assert.equal(
    core.detectPlatform("https://raw.githubusercontent.com/owner/repo/main/file.txt"),
    "gh"
  );
});

test("isDownloadCandidate recognizes supported core platform downloads", () => {
  const core = loadCore();

  assert.equal(
    core.isDownloadCandidate(
      "https://github.com/owner/repo/releases/download/v1.0.0/app.zip",
      { linkText: "app.zip" }
    ),
    true
  );
  assert.equal(
    core.isDownloadCandidate(
      "https://github.com/owner/repo/archive/refs/tags/v1.0.0.tar.gz",
      { linkText: "Source code (tar.gz)" }
    ),
    true
  );
  assert.equal(
    core.isDownloadCandidate(
      "https://gitlab.com/owner/repo/-/archive/v1.0.0/repo-v1.0.0.zip",
      { linkText: "Download archive" }
    ),
    true
  );
  assert.equal(
    core.isDownloadCandidate(
      "https://codeberg.org/owner/repo/releases/download/v1.0.0/app.tar.gz",
      { linkText: "Download" }
    ),
    true
  );
  assert.equal(
    core.isDownloadCandidate(
      "https://huggingface.co/openai-community/gpt2/resolve/main/model.safetensors?download=true",
      { linkText: "548 MB" }
    ),
    true
  );
  assert.equal(
    core.isDownloadCandidate(
      "https://files.pythonhosted.org/packages/hash/app-1.0.0-py3-none-any.whl",
      { linkText: "app-1.0.0-py3-none-any.whl" }
    ),
    true
  );
  assert.equal(
    core.isDownloadCandidate(
      "https://registry.npmjs.org/react/-/react-19.0.0.tgz",
      { linkText: "react-19.0.0.tgz" }
    ),
    true
  );
  assert.equal(
    core.isDownloadCandidate(
      "https://sourceforge.net/projects/sevenzip/files/7-Zip/24.09/7z2409-x64.exe/download",
      { linkText: "Download Latest Version" }
    ),
    true
  );
});

test("isDownloadCandidate rejects obvious non-download links", () => {
  const core = loadCore();

  assert.equal(
    core.isDownloadCandidate("https://github.com/owner/repo/releases", {
      linkText: "Releases",
    }),
    false
  );
  assert.equal(
    core.isDownloadCandidate("https://pypi.org/project/requests/2.32.3/", {
      linkText: "requests 2.32.3",
    }),
    false
  );
});

test("transformDownloadUrl rewrites supported URLs to the active Xget domain", () => {
  const core = loadCore();
  const settings = core.normalizeSettings({
    xgetDomain: "xget.example.com",
    enabledPlatforms: { gh: true, pypi: true, "pypi-files": true, crates: true },
  });

  assert.equal(
    core.transformDownloadUrl(
      "https://github.com/owner/repo/releases/download/v1.0.0/app.zip",
      settings
    ),
    "https://xget.example.com/gh/owner/repo/releases/download/v1.0.0/app.zip"
  );
  assert.equal(
    core.transformDownloadUrl(
      "https://files.pythonhosted.org/packages/hash/app-1.0.0.tar.gz",
      settings
    ),
    "https://xget.example.com/pypi-files/packages/hash/app-1.0.0.tar.gz"
  );
  assert.equal(
    core.transformDownloadUrl(
      "https://crates.io/serde/1.0.0/download",
      settings
    ),
    "https://xget.example.com/crates/api/v1/crates/serde/1.0.0/download"
  );
});

test("shouldBypassClick preserves modifier and non-left-click behavior", () => {
  const core = loadCore();
  const link = { href: "https://github.com/owner/repo/releases/download/v1.0.0/app.zip" };

  assert.equal(
    core.shouldBypassClick(
      { button: 1, defaultPrevented: false, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false },
      link
    ),
    true
  );
  assert.equal(
    core.shouldBypassClick(
      { button: 0, defaultPrevented: false, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
      link
    ),
    true
  );
  assert.equal(
    core.shouldBypassClick(
      { button: 0, defaultPrevented: false, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false },
      link
    ),
    false
  );
});

test("normalizeSettings supports extension and userscript shapes", () => {
  const core = loadCore();

  const extensionSettings = core.normalizeSettings({
    xgetDomain: "https://xget.example.com/",
    enabledPlatforms: { gh: true, gl: false },
  });
  assert.equal(extensionSettings.xgetDomain, "xget.example.com");
  assert.equal(extensionSettings.enabledPlatforms.gh, true);
  assert.equal(extensionSettings.enabledPlatforms.gl, false);
  assert.equal(extensionSettings.activeDomain, "xget.example.com");

  const userscriptSettings = core.normalizeSettings(
    {
      activeProfileId: "custom",
      profiles: [
        { id: "default", name: "Default", domain: "xget.xi-xu.me" },
        { id: "custom", name: "Custom", domain: "https://xget.alt.example/" },
      ],
      enabledPlatforms: { gh: true, hf: true },
      autoProbe: false,
    },
    { mode: "userscript" }
  );

  assert.equal(userscriptSettings.activeProfileId, "custom");
  assert.equal(userscriptSettings.activeDomain, "xget.alt.example");
  assert.equal(userscriptSettings.enabledPlatforms.hf, true);
  assert.equal(userscriptSettings.autoProbe, false);
});
