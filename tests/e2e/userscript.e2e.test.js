const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const USER_SCRIPT_PATH = path.join(
  REPO_ROOT,
  "build",
  "userscript",
  "xget-now.user.js"
);

function buildUserscript() {
  execFileSync("python", ["build.py", "--platform", "userscript"], {
    cwd: REPO_ROOT,
    stdio: "pipe",
  });

  assert.equal(
    fs.existsSync(USER_SCRIPT_PATH),
    true,
    `Expected userscript artifact at ${USER_SCRIPT_PATH}`
  );

  return fs.readFileSync(USER_SCRIPT_PATH, "utf8");
}

function createUserscriptSettings(overrides = {}) {
  return {
    enabled: true,
    activeProfileId: "test-profile",
    profiles: [
      { id: "default", name: "Default", domain: "xget.xi-xu.me" },
      { id: "test-profile", name: "Test Profile", domain: "xget.test" },
    ],
    enabledPlatforms: {
      gh: true,
      gl: true,
      gitea: true,
      codeberg: true,
      sf: true,
      hf: true,
      pypi: true,
      "pypi-files": true,
      npm: true,
    },
    showNotifications: true,
    autoProbe: true,
    ...overrides,
  };
}

async function createHarness(storeOverrides = {}, xgetAvailable = true) {
  const userscriptSource = buildUserscript();
  const browser = await chromium.launch({
    channel: "chromium",
    headless: false,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1800 },
  });
  const seenRequests = [];
  const probeRequests = [];

  await context.exposeBinding("__xgetGMRequest", async (_source, request) => {
    if (request.url === "https://xget.test/gh/robots.txt") {
      probeRequests.push(request.url);
      if (!xgetAvailable) {
        return {
          ok: false,
          error: "Xget probe failed",
        };
      }

      return {
        ok: true,
        status: 204,
        responseText: "",
        finalUrl: request.url,
      };
    }

    const controller = new AbortController();
    const timeoutMs = Number(request.timeout || 0);
    let timeoutId = null;

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }

    try {
      const response = await fetch(request.url, {
        method: request.method || "GET",
        headers: request.headers || {},
        signal: controller.signal,
      });

      return {
        ok: true,
        status: response.status,
        responseText: await response.text(),
        finalUrl: request.url,
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error && typeof error === "object" && "message" in error
            ? String(error.message)
            : String(error),
      };
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  });

  await context.route("https://xget.test/**", async (route) => {
    const request = route.request();
    seenRequests.push(request.url());

    if (!xgetAvailable) {
      await route.abort("failed");
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "text/html",
      headers: {
        "access-control-allow-origin": "*",
      },
      body: "<html><body>ok</body></html>",
    });
  });

  await context.addInitScript(
    ({ initialStore }) => {
      const store = { ...initialStore };

      globalThis.GM_getValue = (key, fallback) =>
        Object.prototype.hasOwnProperty.call(store, key) ? store[key] : fallback;
      globalThis.GM_setValue = (key, value) => {
        store[key] = value;
      };
      globalThis.GM_deleteValue = (key) => {
        delete store[key];
      };
      globalThis.GM_registerMenuCommand = () => {};
      globalThis.__XGET_TEST_STORE__ = store;
      globalThis.GM_xmlhttpRequest = (options) => {
        let aborted = false;
        const request = {
          url: options.url,
          method: options.method || "GET",
          headers: options.headers || {},
          timeout: options.timeout || 0,
        };

        globalThis.__xgetGMRequest(request)
          .then((result) => {
            if (aborted) {
              return;
            }

            if (result.ok) {
              options.onload?.({
                status: result.status,
                responseText: result.responseText,
                finalUrl: result.finalUrl,
              });
              return;
            }

            options.onerror?.(new Error(result.error || "GM_xmlhttpRequest failed"));
          })
          .catch((error) => {
            if (!aborted) {
              options.onerror?.(error);
            }
          });

        return {
          abort() {
            aborted = true;
          },
        };
      };
    },
    {
      initialStore: {
        xget_now_userscript_settings: createUserscriptSettings(storeOverrides),
      },
    }
  );

  await context.addInitScript({ content: userscriptSource });

  return { browser, context, probeRequests, seenRequests };
}

async function clickRoleAndWaitForRequest(page, seenRequests, roleName, expectedUrl) {
  const locatorOptions =
    typeof roleName === "string"
      ? { name: roleName, exact: true }
      : { name: roleName };
  await page.getByRole("link", locatorOptions).click();
  await waitForRequest(seenRequests, expectedUrl);
}

async function clickSelectorAndWaitForRequest(page, seenRequests, selector, expectedUrl) {
  await page.locator(selector).click();
  await waitForRequest(seenRequests, expectedUrl);
}

async function waitForRequest(seenRequests, expectedUrl, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (seenRequests.includes(expectedUrl)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  assert.fail(`Timed out waiting for request: ${expectedUrl}`);
}

test("GitHub release asset clicks rewrite to Xget", async () => {
  const harness = await createHarness();
  const { browser, context, seenRequests } = harness;

  try {
    const page = await context.newPage();
    await page.goto("https://github.com/BurntSushi/ripgrep/releases/tag/14.1.1", {
      waitUntil: "domcontentloaded",
    });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(5000);
    const expectedUrl =
      "https://xget.test/gh/BurntSushi/ripgrep/releases/download/14.1.1/ripgrep-14.1.1-aarch64-apple-darwin.tar.gz";
    await clickRoleAndWaitForRequest(
      page,
      seenRequests,
      "ripgrep-14.1.1-aarch64-apple-darwin.tar.gz",
      expectedUrl
    );

    assert.equal(
      seenRequests.includes(expectedUrl),
      true
    );
  } finally {
    await browser.close();
  }
});

test("GitHub source archive clicks rewrite to Xget", async () => {
  const harness = await createHarness();
  const { browser, context, seenRequests } = harness;

  try {
    const page = await context.newPage();
    await page.goto("https://github.com/BurntSushi/ripgrep/releases/tag/14.1.1", {
      waitUntil: "domcontentloaded",
    });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(5000);
    const expectedUrl =
      "https://xget.test/gh/BurntSushi/ripgrep/archive/refs/tags/14.1.1.zip";
    await clickRoleAndWaitForRequest(page, seenRequests, "Source code (zip)", expectedUrl);

    assert.equal(
      seenRequests.includes(expectedUrl),
      true
    );
  } finally {
    await browser.close();
  }
});

test("PyPI wheel clicks rewrite to Xget", async () => {
  const harness = await createHarness();
  const { browser, context, seenRequests } = harness;

  try {
    const page = await context.newPage();
    await page.goto("https://pypi.org/project/requests/2.32.3/#files", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(3000);
    const expectedUrl =
      "https://xget.test/pypi-files/packages/f9/9b/335f9764261e915ed497fcdeb11df5dfd6f7bf257d4a6a2a686d80da4d54/requests-2.32.3-py3-none-any.whl";
    await clickRoleAndWaitForRequest(
      page,
      seenRequests,
      "requests-2.32.3-py3-none-any.whl",
      expectedUrl
    );

    assert.equal(
      seenRequests.includes(expectedUrl),
      true
    );
  } finally {
    await browser.close();
  }
});

test("Hugging Face file clicks rewrite to Xget", async () => {
  const harness = await createHarness();
  const { browser, context, seenRequests } = harness;

  try {
    const page = await context.newPage();
    await page.goto("https://huggingface.co/openai-community/gpt2/tree/main", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(5000);
    const expectedUrl =
      "https://xget.test/hf/openai-community/gpt2/resolve/main/config.json?download=true";
    await clickSelectorAndWaitForRequest(
      page,
      seenRequests,
      'a[href="/openai-community/gpt2/resolve/main/config.json?download=true"]',
      expectedUrl
    );

    assert.equal(
      seenRequests.includes(expectedUrl),
      true
    );
  } finally {
    await browser.close();
  }
});

test("SourceForge download clicks rewrite to Xget", async () => {
  const harness = await createHarness();
  const { browser, context, seenRequests } = harness;

  try {
    const page = await context.newPage();
    await page.goto(
      "https://sourceforge.net/projects/sevenzip/files/7-Zip/24.09/",
      { waitUntil: "domcontentloaded" }
    );
    await page.waitForTimeout(5000);
    const expectedUrl =
      "https://xget.test/sf/projects/sevenzip/files/7-Zip/24.09/7z2409-x64.exe/download";
    await clickRoleAndWaitForRequest(
      page,
      seenRequests,
      /7z2409-x64\.exe/i,
      expectedUrl
    );

    assert.equal(
      seenRequests.includes(expectedUrl),
      true
    );
  } finally {
    await browser.close();
  }
});

test("modifier clicks bypass userscript interception", async () => {
  const harness = await createHarness();
  const { browser, context, seenRequests } = harness;

  try {
    const page = await context.newPage();
    await context.route(
      "https://github.com/BurntSushi/ripgrep/archive/refs/tags/14.1.1.zip",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<html><body>original</body></html>",
        });
      }
    );
    await page.goto("https://github.com/BurntSushi/ripgrep/releases/tag/14.1.1", {
      waitUntil: "domcontentloaded",
    });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(5000);
    await page.getByRole("link", { name: "Source code (zip)" }).click({
      modifiers: ["Control"],
    });
    await page.waitForTimeout(2000);

    assert.equal(
      seenRequests.some((url) =>
        url.includes("xget.test/gh/BurntSushi/ripgrep/archive/refs/tags/14.1.1.zip")
      ),
      false
    );
  } finally {
    await browser.close();
  }
});

test("falls back to the original URL when the Xget node is unavailable", async () => {
  const harness = await createHarness({}, false);
  const { browser, context, probeRequests, seenRequests } = harness;

  try {
    const page = await context.newPage();
    let originalFallbackRequested = false;
    await context.route(
      "https://github.com/BurntSushi/ripgrep/archive/refs/tags/14.1.1.zip",
      async (route) => {
        originalFallbackRequested = true;
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<html><body>original fallback</body></html>",
        });
      }
    );
    await page.goto("https://github.com/BurntSushi/ripgrep/releases/tag/14.1.1", {
      waitUntil: "domcontentloaded",
    });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(5000);
    await page.getByRole("link", { name: "Source code (zip)" }).click();
    await page.waitForTimeout(2000);

    assert.equal(
      probeRequests.includes("https://xget.test/gh/robots.txt"),
      true
    );
    assert.equal(
      seenRequests.some((url) =>
        url.includes("xget.test/gh/BurntSushi/ripgrep/archive/refs/tags/14.1.1.zip")
      ),
      false
    );
    assert.equal(originalFallbackRequested, true);
    assert.equal(
      page.url(),
      "https://github.com/BurntSushi/ripgrep/releases/tag/14.1.1"
    );
  } finally {
    await browser.close();
  }
});
