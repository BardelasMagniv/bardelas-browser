/// <reference types="vite/client" />

import type { Profile, ProxyCredentials, MirrorConfig, MirrorInputEvent, BrowserEvent, SettingsPayload, AiAgentSession, AiAgentResponse, AiAgentSettings } from '@shared/types';

declare global {
  interface Window {
    api: {
      profiles: {
        list: () => Promise<Profile[]>;
        create: (profile: Profile) => Promise<Profile>;
        update: (profile: Profile) => Promise<Profile>;
        delete: (id: string) => Promise<void>;
        launch: (id: string) => Promise<void>;
        stop: (id: string) => Promise<void>;
        restart: (id: string) => Promise<void>;
        rotateIp: (id: string, country: string) => Promise<void>;
        generateProxy: (country: string, persistent: boolean) => Promise<ProxyCredentials>;
      };
      browser: {
        isRunning: (id: string) => Promise<boolean>;
      };
      ai: {
        listSessions: () => Promise<AiAgentSession[]>;
        listModels: (settings?: AiAgentSettings) => Promise<string[]>;
        start: (profileId: string, settings?: AiAgentSettings) => Promise<AiAgentSession>;
        stop: (sessionId: string) => Promise<void>;
        sendInstruction: (sessionId: string, instruction: string) => Promise<AiAgentResponse>;
        getStatus: (sessionId: string) => Promise<AiAgentSession>;
      };
      mirror: {
        start: (profileId: string, configs: MirrorConfig[]) => Promise<void>;
        stop: () => Promise<void>;
        screenshot: () => Promise<string[]>;
        stream: (enabled: boolean) => Promise<void>;
        sendEvent: (mirrorId: string, event: MirrorInputEvent) => Promise<void>;
        onStream: (callback: (frames: Array<{ id: string; image: string }>) => void) => void;
      };
      settings: {
        get: () => Promise<SettingsPayload>;
        set: (payload: SettingsPayload) => Promise<void>;
      };
      onBrowserEvent: (callback: (event: BrowserEvent) => void) => void;
    };
  }
}

export {};
