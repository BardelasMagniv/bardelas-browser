import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { Profile, ProxyCredentials, BrowserEvent, MirrorConfig, MirrorInputEvent, SettingsPayload, AiAgentSession, AiAgentResponse, AiAgentSettings } from '../shared/types';

contextBridge.exposeInMainWorld('api', {
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list') as Promise<Profile[]>,
    create: (profile: Profile) => ipcRenderer.invoke('profiles:create', profile) as Promise<Profile>,
    save: (profile: Profile) => ipcRenderer.invoke('profiles:save', profile) as Promise<Profile>,
    load: () => ipcRenderer.invoke('profiles:load') as Promise<Profile | null>,
    update: (profile: Profile) => ipcRenderer.invoke('profiles:update', profile) as Promise<Profile>,
    delete: (id: string) => ipcRenderer.invoke('profiles:delete', id) as Promise<void>,
    launch: (id: string) => ipcRenderer.invoke('profiles:launch', id) as Promise<void>,
    stop: (id: string) => ipcRenderer.invoke('profiles:stop', id) as Promise<void>,
    restart: (id: string) => ipcRenderer.invoke('profiles:restart', id) as Promise<void>,
    rotateIp: (id: string, country: string) => ipcRenderer.invoke('profiles:rotateIp', id, country) as Promise<void>,
    generateProxy: (country: string, persistent: boolean) => ipcRenderer.invoke('profiles:generateProxy', country, persistent) as Promise<ProxyCredentials>,
  },
  browser: {
    isRunning: (id: string) => ipcRenderer.invoke('browser:isRunning', id) as Promise<boolean>,
  },
  ai: {
    listSessions: () => ipcRenderer.invoke('ai:listSessions') as Promise<AiAgentSession[]>,
    listModels: (settings?: AiAgentSettings) => ipcRenderer.invoke('ai:listModels', settings) as Promise<string[]>,
    start: (profileId: string, settings?: AiAgentSettings) => ipcRenderer.invoke('ai:start', profileId, settings) as Promise<AiAgentSession>,
    stop: (sessionId: string) => ipcRenderer.invoke('ai:stop', sessionId) as Promise<void>,
    sendInstruction: (sessionId: string, instruction: string) => ipcRenderer.invoke('ai:sendInstruction', sessionId, instruction) as Promise<AiAgentResponse>,
    getStatus: (sessionId: string) => ipcRenderer.invoke('ai:getStatus', sessionId) as Promise<AiAgentSession>,
  },
  mirror: {
    start: (profileId: string, configs: MirrorConfig[]) => ipcRenderer.invoke('mirror:start', profileId, configs) as Promise<void>,
    stop: () => ipcRenderer.invoke('mirror:stop') as Promise<void>,
    screenshot: () => ipcRenderer.invoke('mirror:screenshot') as Promise<string[]>,
    stream: (enabled: boolean) => ipcRenderer.invoke('mirror:stream', enabled) as Promise<void>,
    sendEvent: (mirrorId: string, event: MirrorInputEvent) => ipcRenderer.invoke('mirror:event', mirrorId, event) as Promise<void>,
    onStream: (callback: (frames: Array<{ id: string; image: string }>) => void) => {
      ipcRenderer.on('mirror:stream', (_event, payload) => callback(payload));
    },
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get') as Promise<SettingsPayload>,
    set: (payload: SettingsPayload) => ipcRenderer.invoke('settings:set', payload) as Promise<void>,
  },
  onBrowserEvent: (callback: (event: BrowserEvent) => void) => {
    ipcRenderer.on('browser:event', (_event: IpcRendererEvent, payload: BrowserEvent) => callback(payload));
  },
});
