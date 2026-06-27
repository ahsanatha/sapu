import { launch, type Browser } from 'puppeteer';

let sharedBrowser: Browser | null = null;
let sharedCreatedAt: number | null = null;
let sharedPagesCreated: number = 0;

export async function getBrowser(config: any): Promise<Browser> {
  const useShared: boolean = config?.page_load?.use_shared_browser !== false;
  if (useShared && sharedBrowser && sharedBrowser.isConnected()) return sharedBrowser;

  const isMac = process.platform === 'darwin';
  const isLinux = process.platform === 'linux';
  const isRoot = typeof (process as any).getuid === 'function' ? (process as any).getuid() === 0 : false;

  const disableSandbox = Boolean(config?.page_load?.disable_sandbox) ||
    (process.env.PUPPETEER_DISABLE_SANDBOX === '1') ||
    (isLinux && isRoot);

  const baseArgs: string[] = Array.isArray(config?.page_load?.args) ? config.page_load.args : [];
  const extraArgs: string[] = Array.isArray(config?.page_load?.extra_args) ? config.page_load.extra_args : [];
  const args: string[] = [
    ...baseArgs,
    ...(disableSandbox ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
    ...extraArgs,
  ];

  const headlessMode: boolean = (typeof config?.page_load?.headless === 'boolean')
    ? Boolean(config.page_load.headless)
    : (config?.page_load?.stealth_mode !== false);
  const executablePath =
    config?.executable_path ||
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    (isMac ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);

  const protocolTimeoutCfg = (
    process.env.PUPPETEER_PROTOCOL_TIMEOUT_MS !== undefined
      ? Number(process.env.PUPPETEER_PROTOCOL_TIMEOUT_MS)
      : Number(
          (config?.page_load?.protocol_timeout ??
           config?.page_load?.timeout ??
           config?.timeout ?? 45000)
        )
  );
  const protocolTimeout = Math.max(30000, isNaN(protocolTimeoutCfg) ? 45000 : protocolTimeoutCfg);

  const launchBase = {
    headless: headlessMode,
    args,
    protocolTimeout
  } as const;

  try {
    const browser = await launch({ ...launchBase, pipe: true, executablePath });
    if (useShared) {
      sharedBrowser = browser;
      sharedBrowser.on('disconnected', () => { sharedBrowser = null; });
      sharedCreatedAt = Date.now();
      sharedPagesCreated = 0;
      return sharedBrowser;
    }
    return browser;
  } catch (err: any) {
    console.warn('⚠️ Puppeteer launch (pipe) failed, retrying without pipe:', err?.message || String(err));
    const browser = await launch({ ...launchBase, executablePath });
    if (useShared) {
      sharedBrowser = browser;
      sharedBrowser.on('disconnected', () => { sharedBrowser = null; });
      sharedCreatedAt = Date.now();
      sharedPagesCreated = 0;
      return sharedBrowser;
    }
    return browser;
  }
}

export async function createPage(config: any): Promise<{ browser: Browser; page: any }> {
  const useShared: boolean = config?.page_load?.use_shared_browser !== false;
  const recyclePagesCfg = (
    process.env.PUPPETEER_RECYCLE_PAGES !== undefined
      ? Number(process.env.PUPPETEER_RECYCLE_PAGES)
      : Number(config?.page_load?.recycle_after_pages ?? 200)
  );
  const recycleMsCfg = (
    process.env.PUPPETEER_RECYCLE_MS !== undefined
      ? Number(process.env.PUPPETEER_RECYCLE_MS)
      : Number(config?.page_load?.recycle_after_ms ?? 30 * 60 * 1000)
  );
  const recyclePages = isNaN(recyclePagesCfg) ? 200 : Math.max(1, recyclePagesCfg);
  const recycleMs = isNaN(recycleMsCfg) ? 30 * 60 * 1000 : Math.max(60000, recycleMsCfg);

  if (useShared && sharedBrowser && sharedBrowser.isConnected()) {
    const now = Date.now();
    const ageOk = sharedCreatedAt ? (now - sharedCreatedAt) < recycleMs : true;
    const pagesOk = sharedPagesCreated < recyclePages;
    if (!ageOk || !pagesOk) {
      try { await sharedBrowser.close(); } catch {}
      sharedBrowser = null;
      sharedCreatedAt = null;
      sharedPagesCreated = 0;
    }
  }

  const browser = await getBrowser(config);
  const page = await browser.newPage();
  if (useShared && browser === sharedBrowser) {
    sharedPagesCreated += 1;
    if (!sharedCreatedAt) sharedCreatedAt = Date.now();
  }
  return { browser, page };
}
