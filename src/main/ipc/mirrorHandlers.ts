import { IpcMain } from 'electron';
import { ActionMirrorService } from '../services/ActionMirrorService';
import { browserLauncher } from '../services/BrowserLauncher';
import { EvomiService } from '../services/EvomiService';
import { getEvomiApiKey, getMirrorMode, getGeoSpoofMode } from './settingsHandlers';
import { ProfileRepository } from '../db/ProfileRepository';
import type { MirrorConfig, MirrorInputEvent } from '../../shared/types';

const profileRepository = new ProfileRepository();
const actionMirrorService = new ActionMirrorService();

export function registerMirrorHandlers(ipcMain: IpcMain) {
  ipcMain.handle('mirror:start', async (_event, profileId: string, configs: MirrorConfig[]) => {
    const mainPage = await browserLauncher.getPage(profileId);
    if (!mainPage) {
      throw new Error('Main browser is not running for this profile. Launch it first.');
    }

    const profile = profileRepository.findById(profileId);
    if (!profile) {
      throw new Error('Profile not found for mirror OS resolution.');
    }

    const mirrorPlatform = profile.fingerprintPlatform === 'macos' ? 'macos' : 'windows';
    const apiKey = getEvomiApiKey();
    const mirrorMode = getMirrorMode();
    const geoSpoofMode = getGeoSpoofMode();
    const proxyService = apiKey ? new EvomiService(apiKey) : undefined;
    await actionMirrorService.startMirrors(mainPage, configs, mirrorPlatform, proxyService, mirrorMode, geoSpoofMode === 'cloakbrowser');
  });

  ipcMain.handle('mirror:stop', async () => {
    await actionMirrorService.stopMirrors();
  });

  ipcMain.handle('mirror:stream', async (event, enabled: boolean) => {
    if (enabled) {
      actionMirrorService.startStreaming(event.sender);
    } else {
      actionMirrorService.stopStreaming();
    }
  });

  ipcMain.handle('mirror:screenshot', async () => {
    return actionMirrorService.captureScreenshots();
  });

  ipcMain.handle('mirror:event', async (_event, mirrorId: string, payload: MirrorInputEvent) => {
    await actionMirrorService.sendMirrorInput(mirrorId, payload);
  });
}
