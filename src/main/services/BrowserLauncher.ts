import fs from 'fs';
import path from 'path';
import os from 'os';
import type { Profile, ProfileType, ProxyCredentials } from '../../shared/types';
import { resolveProxyConfig } from './ProxyHelper';
import { FingerprintService, FingerprintOptions } from './FingerprintService';

export interface BrowserSession {
  profileId: string;
  proxy?: ProxyCredentials;
  startTime: number;
}

interface BrowserSessionEntry {
  browser: any;
  context: any;
  page: any;
  profileId: string;
  type: ProfileType;
  storageStatePath?: string;
}

export class BrowserLauncher {
  private activeSessions = new Map<string, BrowserSessionEntry>();
  private fingerprintService = new FingerprintService();
  private readonly DEFAULT_HOME_URL = 'https://google.com';

  private getViewport(profile: Profile) {
    return {
      width: profile.fingerprintScreenWidth ?? 1920,
      height: profile.fingerprintScreenHeight ?? 1080,
    };
  }

  private async setupDefaultPage(page: any) {
    await page.goto(this.DEFAULT_HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined);
  }

  private attachDefaultPageListener(context: any, language?: string) {
    if (typeof context.on === 'function') {
      context.on('page', async (page: any) => {
        // Only navigate brand-new pages to the default home page.
        // Skip pages opened via links/windows so we don't override user navigation.
        const opener = typeof page.opener === 'function' ? page.opener() : null;
        if (opener) {
          return;
        }

        if (language) {
          await page.addInitScript(this.getLanguageSpoofScript(), language).catch(() => undefined);
          await this.applyAcceptLanguageHeader(page, language).catch(() => undefined);
        }
        await this.setupDefaultPage(page);
      });
    }
  }

  private getStorageStatePath(profileId: string): string {
    return path.join(os.homedir(), 'AppData', 'Roaming', 'Bardelas', 'profiles', profileId, 'storage-state.json');
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

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

  private parseProxyGeolocationBody(bodyText: string): {
    latitude: number;
    longitude: number;
    country?: string;
    countryCode?: string;
    region?: string;
    city?: string;
    timezone?: string;
    ip?: string;
  } | null {
    if (!bodyText?.trim()) {
      return null;
    }

    let data: any;
    try {
      data = JSON.parse(bodyText);
    } catch {
      return null;
    }

    const ip = String(data.ip ?? data.ip_address ?? data.query ?? data.client_ip ?? '').trim() || undefined;
    const loc = Array.isArray(data.loc)
      ? data.loc
      : typeof data.loc === 'string'
      ? data.loc.split(',').map((value: string) => Number(value.trim()))
      : [];

    const latitude = Number(
      data.latitude ?? data.lat ?? data.latitud ?? loc[0],
    );
    const longitude = Number(
      data.longitude ?? data.lon ?? data.long ?? data.lng ?? loc[1],
    );

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    const country = String(data.country ?? data.country_name ?? data.countryCode ?? data.country_code ?? '').trim().toUpperCase() || undefined;
    const countryCode = String(data.country_code ?? data.countryCode ?? data.country ?? '').trim().toUpperCase() || undefined;

    return {
      latitude,
      longitude,
      country,
      countryCode,
      region: data.region ?? data.region_name,
      city: data.city,
      timezone: data.timezone,
      ip,
    };
  }

  private async fetchProxyGeolocation(page: any): Promise<{
    latitude: number;
    longitude: number;
    country?: string;
    countryCode?: string;
    region?: string;
    city?: string;
    timezone?: string;
    ip?: string;
  } | null> {
    const geoSources = ['https://ipapi.co/json', 'https://ipwhois.app/json/', 'https://ipinfo.io/json'];

    for (const source of geoSources) {
      try {
        let bodyText = '';

        const response = await page.goto(source, { waitUntil: 'domcontentloaded', timeout: 25000 });
        if (response && response.ok()) {
          bodyText = await page.evaluate(() => document.body.innerText || document.documentElement.innerText);
        }

        if (!bodyText?.trim()) {
          bodyText = await page.evaluate(async (url: string) => {
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) {
              return '';
            }
            return await response.text();
          }, source);
        }

        const geo = this.parseProxyGeolocationBody(bodyText);
        if (geo) {
          return geo;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private async applyGeolocation(context: any, latitude: number, longitude: number): Promise<boolean> {
    try {
      if (typeof context.grantPermissions === 'function') {
        await context.grantPermissions(['geolocation']);
      }
      if (typeof context.setGeolocation === 'function') {
        await context.setGeolocation({ latitude, longitude, accuracy: 100 });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private async setProxyBasedGeolocation(context: any, retries = 2): Promise<boolean> {
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      let page: any | null = null;
      try {
        page = await context.newPage();
        const geo = await this.fetchProxyGeolocation(page);
        if (!geo) {
          continue;
        }

        if (geo.countryCode || geo.country) {
          console.info('Resolved proxy geolocation:', {
            country: geo.country ?? geo.countryCode,
            region: geo.region,
            city: geo.city,
            timezone: geo.timezone,
            ip: geo.ip,
          });
        }

        if (await this.applyGeolocation(context, geo.latitude, geo.longitude)) {
          return true;
        }
      } catch {
        // ignore and retry
      } finally {
        if (page) {
          await page.close().catch(() => undefined);
        }
      }
    }

    return false;
  }

  async launch(profile: Profile, proxy?: ProxyCredentials, useBuiltInGeoSpoofing = false): Promise<BrowserSession> {
    const argOptions: FingerprintOptions = {
      seed: profile.type === 'incognito' ? this.fingerprintService.generateSeed() : profile.fingerprintSeed,
      platform: profile.fingerprintPlatform as 'windows' | 'macos',
      hardwareConcurrency: profile.fingerprintHardwareConcurrency,
      deviceMemory: profile.fingerprintDeviceMemory,
      screenWidth: profile.fingerprintScreenWidth,
      screenHeight: profile.fingerprintScreenHeight,
      brand: 'Chrome',
      browserLanguage: profile.browserLanguage,
    };

    const launchArgs = this.fingerprintService.buildArgs(argOptions);
    const extraArgs = profile.extraArgs ?? [];
    const args = [...launchArgs, ...extraArgs];

    const proxyConfig = proxy
      ? resolveProxyConfig({
          server: `${proxy.protocol}://${proxy.host}:${proxy.port}`,
          username: proxy.username,
          password: proxy.password,
        })
      : { proxyArgs: [] };

    const options: any = {
      headless: false,
      args,
      stealthArgs: false,
      ignoreDefaultArgs: ['--enable-automation', '--enable-unsafe-swiftshader'],
      viewport: this.getViewport(profile),
    };

    if (proxyConfig.proxyOption) {
      options.proxy = proxyConfig.proxyOption;
    }

    if (proxyConfig.proxyArgs?.length) {
      options.args = [...options.args, ...proxyConfig.proxyArgs];
    }

    if (useBuiltInGeoSpoofing) {
      options.geoip = true;
    }

    const cloakbrowserModule = await new Function('return import("cloakbrowser")')();
    const cloakbrowser = cloakbrowserModule.default ?? cloakbrowserModule;

    let context: any;
    try {
      context = await cloakbrowser.launchContext(options);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (useBuiltInGeoSpoofing && /mmdb-lib is required for geoip: true/i.test(errorMessage)) {
        console.warn('Cloakbrowser geoip requires mmdb-lib. Retrying browser launch without geoip.', errorMessage);
        delete options.geoip;
        context = await cloakbrowser.launchContext(options);
      } else {
        throw error;
      }
    }

    const isPersistent = profile.type === 'persistent';
    let storageStatePath: string | undefined;
    if (isPersistent) {
      const profileDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Bardelas', 'profiles', profile.id);
      await fs.promises.mkdir(profileDir, { recursive: true });
      storageStatePath = this.getStorageStatePath(profile.id);
      if (await this.fileExists(storageStatePath)) {
        options.contextOptions = { storageState: storageStatePath };
      }
    }

    this.attachDefaultPageListener(context, profile.browserLanguage);
    await context.addInitScript(this.getStorageSpoofScript());
    if (profile.browserLanguage) {
      await context.addInitScript(this.getLanguageSpoofScript(), profile.browserLanguage);
    }

    if (proxyConfig.proxyOption || proxyConfig.proxyArgs?.length) {
      const geoSet = await this.setProxyBasedGeolocation(context, 2);
      if (!geoSet) {
        console.warn('Could not derive proxy geolocation from the browser proxy; falling back to default cloaked location behavior.');
      }
    }

    const page = await context.newPage();
    if (profile.browserLanguage) {
      await page.addInitScript(this.getLanguageSpoofScript(), profile.browserLanguage).catch(() => undefined);
      await this.applyAcceptLanguageHeader(page, profile.browserLanguage).catch(() => undefined);
    }
    await this.setupDefaultPage(page);
    const sessionEntry: BrowserSessionEntry = {
      browser: context,
      context,
      page,
      profileId: profile.id,
      type: profile.type,
      storageStatePath: storageStatePath,
    };
    this.activeSessions.set(profile.id, sessionEntry);

    return {
      profileId: profile.id,
      proxy,
      startTime: Date.now(),
    };
  }

  async getPage(profileId: string): Promise<any | null> {
    const entry = this.activeSessions.get(profileId);
    return entry ? entry.page : null;
  }

  async stop(profileId: string): Promise<void> {
    const entry = this.activeSessions.get(profileId);
    if (!entry) {
      return;
    }

    try {
      if (entry.type === 'persistent' && entry.storageStatePath) {
        try {
          await entry.context.storageState({ path: entry.storageStatePath });
        } catch (storageError) {
          console.warn('Failed to save persistent storage state for profile', profileId, storageError);
        }
      }
      await entry.browser.close();
    } catch (error) {
      console.error('Error closing browser for profile', profileId, error);
    }
    this.activeSessions.delete(profileId);
  }

  isRunning(profileId: string): boolean {
    return this.activeSessions.has(profileId);
  }
}

export const browserLauncher = new BrowserLauncher();
