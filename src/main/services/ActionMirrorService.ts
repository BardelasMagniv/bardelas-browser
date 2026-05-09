import fs from 'fs';
import path from 'path';
import { app, shell } from 'electron';
import type { WebContents } from 'electron';
import type { MirrorConfig, ProxyCredentials } from '../../shared/types';
import { resolveProxyConfig } from './ProxyHelper';
import { FingerprintService } from './FingerprintService';
import type { EvomiService } from './EvomiService';

interface MirrorEntry {
  id: string;
  browser: any;
  page: any;
  config: MirrorConfig;
}

const MIRROR_COUNTRIES = ['US', 'GB', 'DE', 'FR', 'BR', 'IN', 'JP', 'AU', 'CA'];

export class ActionMirrorService {
  private mirrors = new Map<string, MirrorEntry>();
  private mainPage: any | null = null;
  private mirrorListenerAttached = false;
  private attachedMainPage: any | null = null;
  private streamingInterval: NodeJS.Timeout | null = null;
  private streamTarget: WebContents | null = null;
  private mirrorMode: 'default' | 'playwright' = 'default';
  private mirrorScrollPositions = new Map<string, number>();
  private fingerprintService = new FingerprintService();

  private getStorageSpoofScript() {
    return () => {
      const storage = (window.navigator as any).storage;
      if (storage?.estimate) {
        const originalEstimate = storage.estimate.bind(storage);
        storage.estimate = async function () {
          const result = await originalEstimate();
          return {
            ...result,
            quota: 1200000000,
            usage: result.usage ?? 0,
            usageDetails: result.usageDetails ?? {},
          };
        };
      }
      const webkitStorage = (window.navigator as any).webkitTemporaryStorage;
      if (webkitStorage?.queryUsageAndQuota) {
        const originalQuery = webkitStorage.queryUsageAndQuota.bind(webkitStorage);
        webkitStorage.queryUsageAndQuota = function (success: any, error: any) {
          return originalQuery(
            (usage: number, quota: number) => success(usage, Math.max(quota, 1200000000)),
            error,
          );
        };
      }
    };
  }

  private getLanguageSpoofScript() {
    return (language: string) => {
      const normalizedLanguage = String(language).trim();
      const languageParts = normalizedLanguage
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const browserLanguage = languageParts[0] || normalizedLanguage;
      const languages = [browserLanguage, browserLanguage.split('-')[0]].filter(Boolean);

      const defineNavigatorProperty = (name: string, value: unknown) => {
        const descriptor = {
          get: () => value,
          configurable: true,
        };

        try {
          Object.defineProperty(navigator, name, descriptor);
        } catch {
          try {
            const navProto = Object.getPrototypeOf(navigator);
            if (navProto) {
              Object.defineProperty(navProto, name, descriptor);
            }
          } catch {
            // ignore
          }
        }
      };

      defineNavigatorProperty('language', browserLanguage);
      defineNavigatorProperty('languages', languages);
      defineNavigatorProperty('userLanguage', browserLanguage);
      defineNavigatorProperty('browserLanguage', browserLanguage);

      if (document?.documentElement) {
        document.documentElement.setAttribute('lang', browserLanguage);
      }
    };
  }

  private async applyAcceptLanguageHeader(page: any, language: string) {
    const context = typeof page.context === 'function' ? page.context() : undefined;
    if (context && typeof context.setExtraHTTPHeaders === 'function') {
      await context.setExtraHTTPHeaders({ 'Accept-Language': language });
      return;
    }
    if (typeof page.setExtraHTTPHeaders === 'function') {
      await page.setExtraHTTPHeaders({ 'Accept-Language': language });
    }
  }

  private async generateMirrorProxyWithRetry(
    proxyService: EvomiService,
    country: string,
    attempts = 3,
    delayMs = 1500
  ): Promise<ProxyCredentials> {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await proxyService.generateProxy(country, false);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('Evomi API key is not configured.')) {
          throw error;
        }
        if (attempt === attempts) {
          throw error;
        }
        console.warn(`Evomi mirror proxy generation attempt ${attempt} failed, retrying after ${delayMs}ms...`, error);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw new Error('Evomi mirror proxy generation failed after retries.');
  }

  private parseGeoJsonForLanguage(bodyText: string): { countryCode?: string; language?: string } | null {
    if (!bodyText?.trim()) {
      return null;
    }

    let data: any;
    try {
      data = JSON.parse(bodyText);
    } catch {
      return null;
    }

    const rawLanguage = String(data.languages ?? data.language ?? '').trim();
    const countryCode = String(data.country_code ?? data.countryCode ?? data.country ?? '').trim().toUpperCase();
    const language = rawLanguage ? rawLanguage.split(',')[0].trim().replace('_', '-') : undefined;

    return {
      countryCode: countryCode || undefined,
      language: language || undefined,
    };
  }

  private async resolveMirrorLanguage(page: any): Promise<string | undefined> {
    const geoSources = ['https://ipapi.co/json', 'https://ipwhois.app/json/', 'https://ipinfo.io/json'];
    const countryLanguageMap: Record<string, string> = {
      US: 'en-US',
      GB: 'en-GB',
      DE: 'de-DE',
      FR: 'fr-FR',
      BR: 'pt-BR',
      IN: 'en-IN',
      JP: 'ja-JP',
      AU: 'en-AU',
      CA: 'en-CA',
      ES: 'es-ES',
      MX: 'es-MX',
      IT: 'it-IT',
      NL: 'nl-NL',
      SE: 'sv-SE',
      NO: 'nb-NO',
      RU: 'ru-RU',
      CN: 'zh-CN',
      KR: 'ko-KR',
      TR: 'tr-TR',
    };

    for (const source of geoSources) {
      try {
        const response = await page.goto(source, { waitUntil: 'domcontentloaded', timeout: 25000 });
        if (!response || !response.ok()) {
          continue;
        }

        const bodyText = await page.evaluate(() => document.body.innerText || document.documentElement.innerText);
        const parsed = this.parseGeoJsonForLanguage(bodyText);
        if (parsed?.language) {
          return parsed.language;
        }
        if (parsed?.countryCode && countryLanguageMap[parsed.countryCode]) {
          return countryLanguageMap[parsed.countryCode];
        }
      } catch {
        continue;
      }
    }

    return undefined;
  }

  async startMirrors(
    mainPage: any,
    configs: MirrorConfig[],
    platform: 'windows' | 'macos',
    proxyService?: EvomiService,
    mirrorMode: 'default' | 'playwright' = 'default',
    useBuiltInGeoSpoofing = false
  ): Promise<void> {
    await this.stopMirrors();
    this.mainPage = mainPage;
    this.mirrorMode = mirrorMode;
    await this.attachMirrorListeners(mainPage);

    const cloakbrowserModule = await new Function('return import("cloakbrowser")')();
    const cloakbrowser = cloakbrowserModule.default ?? cloakbrowserModule;
    const currentUrl = mainPage.url();
    const launchedMirrors: MirrorEntry[] = [];

    try {
      for (const config of configs) {
        const targetCountry = config.useRandomIdentity
          ? MIRROR_COUNTRIES[Math.floor(Math.random() * MIRROR_COUNTRIES.length)]
          : config.country;
        let proxy;
        if (proxyService) {
          try {
            proxy = await this.generateMirrorProxyWithRetry(proxyService, targetCountry);
          } catch (error) {
            throw new Error(
              `Failed to acquire a mirror proxy from Evomi after retries. Mirror startup is blocked to avoid exposing your real IP. ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }
        const fingerprintArgs = this.fingerprintService.buildArgs({
          seed: Math.floor(Math.random() * 90000) + 10000,
          platform,
        });
        const proxyConfig = proxy
          ? resolveProxyConfig({
              server: `socks5://${proxy.host}:${proxy.port}`,
              username: proxy.username,
              password: proxy.password,
            })
          : { proxyArgs: [] };

        const launchOptions: any = {
          headless: true,
          args: [...fingerprintArgs, ...(proxyConfig.proxyArgs ?? [])],
          stealthArgs: false,
          viewport: { width: 1920, height: 947 },
        };
        if (proxyConfig.proxyOption) {
          launchOptions.proxy = proxyConfig.proxyOption;
        }
        if (useBuiltInGeoSpoofing) {
          launchOptions.geoip = true;
        }

        let context: any;
        try {
          context = await cloakbrowser.launchContext(launchOptions);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (useBuiltInGeoSpoofing && /mmdb-lib is required for geoip: true/i.test(errorMessage)) {
            console.warn('Cloakbrowser geoip requires mmdb-lib. Retrying mirror launch without geoip.', errorMessage);
            delete launchOptions.geoip;
            context = await cloakbrowser.launchContext(launchOptions);
          } else {
            throw error;
          }
        }
        await context.addInitScript(this.getStorageSpoofScript());
        const page = await context.newPage();

        if (proxy) {
          const mirrorLanguage = await this.resolveMirrorLanguage(page);
          if (mirrorLanguage) {
            await context.addInitScript(this.getLanguageSpoofScript(), mirrorLanguage);
            await page.addInitScript(this.getLanguageSpoofScript(), mirrorLanguage).catch(() => undefined);
            await this.applyAcceptLanguageHeader(page, mirrorLanguage).catch(() => undefined);
          }
        }

        if (currentUrl && currentUrl !== 'about:blank') {
          await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined);
        }

        const mirrorEntry = { id: config.id, browser: context, page, config };
        this.mirrors.set(config.id, mirrorEntry);
        launchedMirrors.push(mirrorEntry);
      }
    } catch (error) {
      await Promise.all(
        launchedMirrors.map(async (entry) => {
          try {
            await entry.browser.close();
          } catch (closeError) {
            console.warn('Failed to close partial mirror after startup error:', entry.id, closeError);
          }
        })
      );
      this.mirrors.clear();
      throw error;
    }
  }

  async stopMirrors(): Promise<void> {
    this.mainPage = null;
    this.stopStreaming();
    const closePromises = Array.from(this.mirrors.values()).map(async (entry) => {
      try {
        await entry.browser.close();
      } catch (error) {
        console.warn('Failed to close mirror browser during cleanup:', entry.id, error);
      }
    });
    await Promise.all(closePromises);
    this.mirrors.clear();
    this.mirrorScrollPositions.clear();
  }

  async sendMirrorInput(mirrorId: string, event: any): Promise<void> {
    const entry = this.mirrors.get(mirrorId);
    if (!entry) {
      return;
    }

    if (event.type === 'click') {
      await this.handleClickEvent([entry], event);
      return;
    }

    if (event.type === 'scroll') {
      await this.handleScrollEvent([entry], event);
      return;
    }

    if (event.type === 'keydown' || event.type === 'keyup') {
      await this.handleKeyboardEvent([entry], event);
      return;
    }
  }

  async captureScreenshots(): Promise<string[]> {
    const screenshots: string[] = [];
    const screenshotDir = path.join(app.getPath('userData'), 'screenshots');
    await fs.promises.mkdir(screenshotDir, { recursive: true });

    for (const [index, entry] of Array.from(this.mirrors.values()).entries()) {
      try {
        const data = await entry.page.screenshot({ type: 'jpeg', quality: 70, fullPage: true });
        const filename = `${entry.config.id}-${Date.now()}-${index + 1}.jpg`;
        const filePath = path.join(screenshotDir, filename);
        await fs.promises.writeFile(filePath, data);
        screenshots.push(data.toString('base64'));
      } catch (error) {
        console.warn(`Mirror screenshot failed for ${entry.config.id}:`, error);
      }
    }

    await shell.openPath(screenshotDir);
    return screenshots;
  }

  startStreaming(target: WebContents, intervalMs = 3000) {
    this.stopStreaming();
    this.streamTarget = target;
    this.streamingInterval = setInterval(() => this.broadcastMirrorFrames().catch(console.warn), intervalMs);
    void this.broadcastMirrorFrames();
  }

  stopStreaming() {
    if (this.streamingInterval) {
      clearInterval(this.streamingInterval);
      this.streamingInterval = null;
    }
    this.streamTarget = null;
  }

  private async broadcastMirrorFrames() {
    if (!this.streamTarget || this.streamTarget.isDestroyed()) {
      this.stopStreaming();
      return;
    }

    const frames = await Promise.all(
      Array.from(this.mirrors.values()).map(async (entry) => {
        try {
          const data = await entry.page.screenshot({ type: 'jpeg', quality: 40 });
          return {
            id: entry.config.id,
            image: data.toString('base64'),
          };
        } catch {
          return {
            id: entry.config.id,
            image: '',
          };
        }
      })
    );

    if (this.streamTarget && !this.streamTarget.isDestroyed()) {
      this.streamTarget.send('mirror:stream', frames);
    }
  }

  private async attachMirrorListeners(page: any) {
    if (this.mirrorListenerAttached && this.attachedMainPage === page) {
      return;
    }

    await page.exposeBinding('__bardelasMirror', false, async (_source: any, event: any) => {
      await this.dispatchMirrorEvent(event);
    });

    const attachMirrorScript = () => {
      const sendMirrorEvent = (event: any) => {
        const anyWindow = window as any;
        anyWindow.__bardelasMirror?.(event);
      };

      const publishClick = (event: MouseEvent) => {
        sendMirrorEvent({
          type: 'click',
          x: event.clientX,
          y: event.clientY,
          button: event.button || 0,
        });
      };

      const publishScroll = () => {
        sendMirrorEvent({
          type: 'scroll',
          x: window.scrollX,
          y: window.scrollY,
        });
      };

      const publishKeyboard = (event: KeyboardEvent) => {
        sendMirrorEvent({
          type: event.type,
          key: event.key,
          code: event.code,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
        });
      };

      const publishNavigation = () => {
        sendMirrorEvent({
          type: 'navigation',
          url: location.href,
        });
      };

      window.addEventListener('click', publishClick, true);
      window.addEventListener('scroll', publishScroll, { passive: true });
      window.addEventListener('keydown', publishKeyboard, true);
      window.addEventListener('keyup', publishKeyboard, true);
      window.addEventListener('popstate', publishNavigation);

      const originalPushState = history.pushState.bind(history);
      history.pushState = (...args: any[]) => {
        const result = (originalPushState as any).apply(history, args);
        publishNavigation();
        return result;
      };

      const originalReplaceState = history.replaceState.bind(history);
      history.replaceState = (...args: any[]) => {
        const result = (originalReplaceState as any).apply(history, args);
        publishNavigation();
        return result;
      };
    };

    await page.addInitScript(attachMirrorScript);
    await page.evaluate(attachMirrorScript);

    page.on('framenavigated', async (frame: any) => {
      if (frame === page.mainFrame()) {
        const url = page.url();
        await this.broadcastNavigate(url);
      }
    });

    this.mirrorListenerAttached = true;
    this.attachedMainPage = page;
  }

  private async dispatchMirrorEvent(event: any) {
    if (!event || !event.type) {
      return;
    }

    const mirrorEntries = Array.from(this.mirrors.values());
    const handleSettled = async (results: PromiseSettledResult<unknown>[]) => {
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const entry = mirrorEntries[index];
          console.warn(`Mirror event failed for ${entry?.id}:`, result.reason);
        }
      });
    };

    if (event.type === 'click') {
      await this.handleClickEvent(mirrorEntries, event);
      return;
    }

    if (event.type === 'scroll') {
      await this.handleScrollEvent(mirrorEntries, event);
      return;
    }

    if (event.type === 'keydown' || event.type === 'keyup') {
      await this.handleKeyboardEvent(mirrorEntries, event);
      return;
    }

    if (event.type === 'navigation' && event.url) {
      await this.broadcastNavigate(event.url);
      return;
    }
  }

  private async broadcastNavigate(url: string) {
    const mirrorEntries = Array.from(this.mirrors.values());
    const promises = mirrorEntries.map((entry) =>
      entry.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((error: any) => {
        console.warn(`Mirror navigation failed for ${entry.id}:`, error);
        return undefined;
      })
    );
    await Promise.all(promises);
  }

  private async handleClickEvent(mirrorEntries: MirrorEntry[], event: any) {
    const promises = mirrorEntries.map((entry) => {
      if (this.mirrorMode === 'playwright') {
        return entry.page.mouse.move(event.x, event.y).then(() =>
          entry.page.mouse.click(event.x, event.y, { button: event.button === 2 ? 'right' : 'left' })
        );
      }
      return entry.page.mouse.click(event.x, event.y, { button: event.button === 2 ? 'right' : 'left' });
    });
    await Promise.allSettled(promises).then((results) => {
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const entry = mirrorEntries[index];
          console.warn(`Mirror click failed for ${entry?.id}:`, result.reason);
        }
      });
    });
  }

  private async handleScrollEvent(mirrorEntries: MirrorEntry[], event: any) {
    const promises = mirrorEntries.map((entry) => {
      if (this.mirrorMode === 'playwright') {
        if (typeof event.deltaY === 'number') {
          return entry.page.mouse.wheel({ deltaX: 0, deltaY: event.deltaY });
        }
        const previousY = this.mirrorScrollPositions.get(entry.id) ?? event.y;
        const deltaY = event.y - previousY;
        this.mirrorScrollPositions.set(entry.id, event.y);
        return entry.page.mouse.wheel({ deltaX: 0, deltaY });
      }
      if (typeof event.deltaY === 'number') {
        return entry.page.evaluate(
          ({ deltaY }: { deltaY: number }) => window.scrollBy(0, deltaY),
          { deltaY: event.deltaY }
        );
      }
      return entry.page.evaluate(
        ({ x, y }: { x: number; y: number }) => window.scrollTo(x, y),
        { x: event.x, y: event.y }
      );
    });
    await Promise.allSettled(promises).then((results) => {
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const entry = mirrorEntries[index];
          console.warn(`Mirror scroll failed for ${entry?.id}:`, result.reason);
        }
      });
    });
  }

  private async handleKeyboardEvent(mirrorEntries: MirrorEntry[], event: any) {
    const promises = mirrorEntries.map((entry) => {
      if (this.mirrorMode === 'playwright') {
        return event.type === 'keydown'
          ? entry.page.keyboard.down(event.key)
          : entry.page.keyboard.up(event.key);
      }
      return event.type === 'keydown'
        ? entry.page.keyboard.down(event.key)
        : entry.page.keyboard.up(event.key);
    });
    await Promise.allSettled(promises).then((results) => {
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const entry = mirrorEntries[index];
          console.warn(`Mirror keyboard event failed for ${entry?.id}:`, result.reason);
        }
      });
    });
  }
}
