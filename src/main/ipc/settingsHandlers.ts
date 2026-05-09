import { IpcMain } from 'electron';
import Store from 'electron-store';
import type { SettingsPayload } from '../../shared/types';

const store = new Store({
  name: 'bardelas-settings',
  defaults: {
    evomiApiKey: '',
    mirrorMode: 'default',
    geoSpoofMode: 'custom',
    aiOllamaHost: '127.0.0.1',
    aiOllamaPort: 11434,
    aiModelName: 'llama2',
    aiOcrEnabled: false,
  },
});

export function registerSettingsHandlers(ipcMain: IpcMain) {
  ipcMain.handle('settings:get', async () => {
    return {
      evomiApiKey: store.get('evomiApiKey', ''),
      mirrorMode: store.get('mirrorMode', 'default') as 'default' | 'playwright',
      geoSpoofMode: store.get('geoSpoofMode', 'custom') as 'cloakbrowser' | 'custom',
      aiOllamaHost: store.get('aiOllamaHost', '127.0.0.1'),
      aiOllamaPort: store.get('aiOllamaPort', 11434),
      aiModelName: store.get('aiModelName', 'llama2'),
      aiOcrEnabled: store.get('aiOcrEnabled', false),
    } as SettingsPayload;
  });

  ipcMain.handle('settings:set', async (_event, payload: SettingsPayload) => {
    store.set('evomiApiKey', payload.evomiApiKey || '');
    store.set('mirrorMode', payload.mirrorMode || 'default');
    store.set('geoSpoofMode', payload.geoSpoofMode || 'custom');
    store.set('aiOllamaHost', payload.aiOllamaHost || '127.0.0.1');
    store.set('aiOllamaPort', payload.aiOllamaPort ?? 11434);
    store.set('aiModelName', payload.aiModelName || 'llama2');
    store.set('aiOcrEnabled', payload.aiOcrEnabled ?? false);
  });
}

export function getEvomiApiKey(): string {
  return store.get('evomiApiKey', '');
}

export function getMirrorMode(): 'default' | 'playwright' {
  return store.get('mirrorMode', 'default') as 'default' | 'playwright';
}

export function getGeoSpoofMode(): 'cloakbrowser' | 'custom' {
  return store.get('geoSpoofMode', 'custom') as 'cloakbrowser' | 'custom';
}
