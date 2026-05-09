import { BrowserWindow, dialog, IpcMain } from 'electron';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { ProfileRepository } from '../db/ProfileRepository';
import { browserLauncher } from '../services/BrowserLauncher';
import { EvomiService } from '../services/EvomiService';
import { FingerprintService } from '../services/FingerprintService';
import { getEvomiApiKey, getGeoSpoofMode } from './settingsHandlers';
import type { Profile, ProxyCredentials } from '../../shared/types';

const profileRepository = new ProfileRepository();
const fingerprintService = new FingerprintService();

async function generateProxyWithRetry(
  proxyService: EvomiService,
  country: string,
  persistent: boolean,
  attempts = 3,
  delayMs = 1500
): Promise<ProxyCredentials> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await proxyService.generateProxy(country, persistent);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Evomi API key is not configured.')) {
        throw error;
      }
      if (attempt === attempts) {
        throw error;
      }
      console.warn(`Evomi proxy generation attempt ${attempt} failed, retrying after ${delayMs}ms...`, error);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Evomi proxy generation failed after retries.');
}

async function prepareProxyForLaunch(profile: Profile): Promise<ProxyCredentials | undefined> {
  const apiKey = getEvomiApiKey();
  const proxyService = apiKey ? new EvomiService(apiKey) : undefined;
  let proxy: ProxyCredentials | undefined;

  const hasPersistentProxy =
    profile.type === 'persistent' &&
    profile.proxyHost &&
    profile.proxyPort &&
    profile.proxyUsername &&
    profile.proxyPassword &&
    profile.proxySessionType === 'hard';

  if (profile.type === 'persistent') {
    if (hasPersistentProxy) {
      proxy = {
        host: profile.proxyHost!,
        port: profile.proxyPort!,
        username: profile.proxyUsername!,
        password: profile.proxyPassword!,
        protocol: profile.proxyProtocol ?? 'socks5',
      };
    } else if (proxyService) {
      try {
        proxy = await generateProxyWithRetry(proxyService, profile.country, true);
        profile.proxyHost = proxy.host;
        profile.proxyPort = proxy.port;
        profile.proxyUsername = proxy.username;
        profile.proxyPassword = proxy.password;
        profile.proxyProtocol = proxy.protocol;
        profile.proxySessionType = 'hard';
        profileRepository.update(profile);
      } catch (error) {
        throw new Error(
          `Failed to acquire a persistent proxy from Evomi after retries. Browser launch is blocked to avoid exposing your real IP. ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  } else if (proxyService) {
    try {
      proxy = await generateProxyWithRetry(proxyService, profile.country, false);
    } catch (error) {
      throw new Error(
        `Failed to acquire an ephemeral proxy from Evomi after retries. Browser launch is blocked to avoid exposing your real IP. ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  return proxy;
}

export function registerProfileHandlers(ipcMain: IpcMain) {
  ipcMain.handle('profiles:list', async () => {
    return profileRepository.list();
  });

  ipcMain.handle('profiles:create', async (_event, profile: Profile) => {
    const candidate: Profile = {
      ...profile,
      id: profile.id || uuidv4(),
      fingerprintSeed: profile.fingerprintSeed || fingerprintService.generateSeed(),
      fingerprintPlatform: profile.fingerprintPlatform || 'windows',
      fingerprintBrand: 'Chrome',
      browserLanguage: profile.browserLanguage || 'en-US',
      createdAt: Date.now(),
      extraArgs: profile.extraArgs ?? [],
    };
    return profileRepository.create(candidate);
  });

  ipcMain.handle('profiles:save', async (event, profile: Profile) => {
    const profileToSave: Profile = {
      ...profile,
      id: profile.id || uuidv4(),
      country: profile.country.toUpperCase(),
      fingerprintSeed: profile.fingerprintSeed || fingerprintService.generateSeed(),
      fingerprintPlatform: profile.fingerprintPlatform || 'windows',
      fingerprintBrand: 'Chrome',
      browserLanguage: profile.browserLanguage || 'en-US',
      createdAt: profile.createdAt || Date.now(),
      extraArgs: profile.extraArgs ?? [],
    };

    const existing = profileRepository.findById(profileToSave.id);
    if (existing) {
      profileRepository.update(profileToSave);
    } else {
      profileRepository.create(profileToSave);
    }

    const focusedWindow = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = focusedWindow
      ? await dialog.showSaveDialog(focusedWindow, {
          title: 'Save profile',
          defaultPath: `${profileToSave.name || 'profile'}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        })
      : await dialog.showSaveDialog({
          title: 'Save profile',
          defaultPath: `${profileToSave.name || 'profile'}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });

    if (!canceled && filePath) {
      await fs.promises.writeFile(filePath, JSON.stringify(profileToSave, null, 2), 'utf-8');
    }

    return profileToSave;
  });

  ipcMain.handle('profiles:update', async (_event, profile: Profile) => {
    return profileRepository.update(profile);
  });

  ipcMain.handle('profiles:load', async (event) => {
    const focusedWindow = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = focusedWindow
      ? await dialog.showOpenDialog(focusedWindow, {
          title: 'Load profile',
          properties: ['openFile'],
          filters: [{ name: 'JSON', extensions: ['json'] }],
        })
      : await dialog.showOpenDialog({
          title: 'Load profile',
          properties: ['openFile'],
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });

    if (canceled || filePaths.length === 0) {
      return null;
    }

    const fileContents = await fs.promises.readFile(filePaths[0], 'utf-8');
    const parsed = JSON.parse(fileContents) as Record<string, unknown>;
    const imported: Profile = {
      ...parsed,
      id: (parsed.id as string) || uuidv4(),
      name: (parsed.name as string) || 'Imported Profile',
      type: parsed.type === 'incognito' ? 'incognito' : 'persistent',
      country: ((parsed.country as string) || 'US').toUpperCase(),
      browserLanguage: (parsed.browserLanguage as string) || 'en-US',
      createdAt: Number(parsed.createdAt) || Date.now(),
      lastUsedAt: parsed.lastUsedAt ? Number(parsed.lastUsedAt) : undefined,
      fingerprintSeed: Number(parsed.fingerprintSeed) || fingerprintService.generateSeed(),
      fingerprintPlatform: (parsed.fingerprintPlatform as string) || 'windows',
      fingerprintHardwareConcurrency: parsed.fingerprintHardwareConcurrency !== undefined ? Number(parsed.fingerprintHardwareConcurrency) : 8,
      fingerprintDeviceMemory: parsed.fingerprintDeviceMemory !== undefined ? Number(parsed.fingerprintDeviceMemory) : 8,
      fingerprintScreenWidth: parsed.fingerprintScreenWidth !== undefined ? Number(parsed.fingerprintScreenWidth) : 1920,
      fingerprintScreenHeight: parsed.fingerprintScreenHeight !== undefined ? Number(parsed.fingerprintScreenHeight) : 1080,
      fingerprintBrand: 'Chrome',
      proxyHost: parsed.proxyHost as string | undefined,
      proxyPort: parsed.proxyPort !== undefined ? Number(parsed.proxyPort) : undefined,
      proxyUsername: parsed.proxyUsername as string | undefined,
      proxyPassword: parsed.proxyPassword as string | undefined,
      proxyProtocol: (parsed.proxyProtocol as string) === 'http' ? 'http' : 'socks5',
      proxySessionType: parsed.proxySessionType === 'hard' ? 'hard' : undefined,
      userDataDir: parsed.userDataDir as string | undefined,
      extraArgs: Array.isArray(parsed.extraArgs)
        ? (parsed.extraArgs as unknown[]).map((item) => String(item)).filter(Boolean)
        : [],
    } as Profile;

    const existing = profileRepository.findById(imported.id);
    if (existing) {
      profileRepository.update(imported);
      return imported;
    }

    return profileRepository.create(imported);
  });

  ipcMain.handle('profiles:delete', async (_event, id: string) => {
    await browserLauncher.stop(id);
    profileRepository.delete(id);
  });

  ipcMain.handle('profiles:generateProxy', async (_event, country: string, persistent: boolean) => {
    const apiKey = getEvomiApiKey();
    const service = new EvomiService(apiKey);
    return service.generateProxy(country, persistent);
  });

  ipcMain.handle('profiles:launch', async (_event, id: string) => {
    const profile = profileRepository.findById(id);
    if (!profile) {
      throw new Error('Profile not found');
    }

    const proxy = await prepareProxyForLaunch(profile);
    const session = await browserLauncher.launch(profile, proxy);
    profile.lastUsedAt = Date.now();
    profileRepository.update(profile);
    return session;
  });

  ipcMain.handle('profiles:restart', async (_event, id: string) => {
    await browserLauncher.stop(id);
    const profile = profileRepository.findById(id);
    if (!profile) {
      throw new Error('Profile not found');
    }

    const proxy = await prepareProxyForLaunch(profile);
    const session = await browserLauncher.launch(profile, proxy);
    profile.lastUsedAt = Date.now();
    profileRepository.update(profile);
    return session;
  });

  ipcMain.handle('profiles:rotateIp', async (_event, id: string, country: string) => {
    const profile = profileRepository.findById(id);
    if (!profile) {
      throw new Error('Profile not found');
    }

    await browserLauncher.stop(id);
    profile.country = country.toUpperCase();
    profile.proxyHost = undefined;
    profile.proxyPort = undefined;
    profile.proxyUsername = undefined;
    profile.proxyPassword = undefined;
    profile.proxyProtocol = undefined;
    profile.proxySessionType = undefined;
    profileRepository.update(profile);

    const proxy = await prepareProxyForLaunch(profile);
    const session = await browserLauncher.launch(profile, proxy);
    profile.lastUsedAt = Date.now();
    profileRepository.update(profile);
    return session;
  });

  ipcMain.handle('profiles:stop', async (_event, id: string) => {
    await browserLauncher.stop(id);
  });
}
