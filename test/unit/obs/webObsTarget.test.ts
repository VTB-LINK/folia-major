import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/webAiConfig', () => ({ getWebAiConfig: vi.fn() }));

import { resolveWebObsTarget, selectWebObsSource } from '@/utils/webObsTarget';
import { useSettingsUiStore } from '@/stores/useSettingsUiStore';
import { getWebAiConfig } from '@/services/webAiConfig';

const aiConfigMock = vi.mocked(getWebAiConfig);
const webAiConfig = (patch: Record<string, unknown> = {}) => ({
    provider: 'gemini',
    geminiApiKey: '',
    openaiApiKey: '',
    openaiApiUrl: '',
    openaiApiModel: '',
    ...patch,
}) as never;

// test/unit/obs/webObsTarget.test.ts
// Web stage source derivation for the copy-OBS-URL buttons: PlayerCap takes precedence over
// Now Playing, and PlayerCap URLs carry only its non-default connection params. Every target
// also carries the obsTheme mode marker, which the overlay reads to pick static vs dynamic.

describe('selectWebObsSource', () => {
    it('prefers playercap, then now-playing, else null', () => {
        expect(selectWebObsSource({ enablePlayerCapStage: true, enableNowPlayingStage: false })).toBe('playercap');
        expect(selectWebObsSource({ enablePlayerCapStage: false, enableNowPlayingStage: true })).toBe('now-playing');
        expect(selectWebObsSource({ enablePlayerCapStage: true, enableNowPlayingStage: true })).toBe('playercap');
        expect(selectWebObsSource({ enablePlayerCapStage: false, enableNowPlayingStage: false })).toBeNull();
    });
});

describe('resolveWebObsTarget', () => {
    beforeEach(() => {
        useSettingsUiStore.setState({
            enableNowPlayingStage: false,
            enablePlayerCapStage: false,
            playerCapHost: 'localhost:8765',
            playerCapPlayer: '',
            playerCapTimeBasis: 'play_time',
            playerCapSticky: true,
            // Pin the theme mode: the store is a singleton across cases, so leaving it unset would
            // leak a previous case's mode and make this file order-dependent.
            webObsThemeMode: 'builtin',
        });
    });

    it('returns null when no web stage source is on', () => {
        expect(resolveWebObsTarget()).toBeNull();
    });

    it('returns a bare now-playing target', () => {
        useSettingsUiStore.setState({ enableNowPlayingStage: true });
        expect(resolveWebObsTarget()).toEqual({ source: 'now-playing', host: '', extra: { obsTheme: 'builtin' } });
    });

    it('omits playercap params equal to the OBS defaults', () => {
        useSettingsUiStore.setState({ enablePlayerCapStage: true });
        expect(resolveWebObsTarget()).toEqual({ source: 'playercap', host: '', extra: { obsTheme: 'builtin' } });
    });

    it('carries non-default playercap host/nxpcPlayer/nxpcBasis/nxpcSticky', () => {
        useSettingsUiStore.setState({
            enablePlayerCapStage: true,
            playerCapHost: '192.168.1.9:8765',
            playerCapPlayer: 'foobar2000',
            playerCapTimeBasis: 'timestamp',
            playerCapSticky: false,
        });
        expect(resolveWebObsTarget()).toEqual({
            source: 'playercap',
            host: '192.168.1.9:8765',
            extra: { obsTheme: 'builtin', nxpcPlayer: 'foobar2000', nxpcBasis: 'timestamp', nxpcSticky: '0' },
        });
    });
});

// The mode marker is what the overlay reads to pick static vs dynamic, and under 'ai' it also gates
// the AI connection params. aiFollow used to be that gate; obsTheme=ai replaced it outright.
describe('resolveWebObsTarget theme mode', () => {
    beforeEach(() => {
        aiConfigMock.mockReset().mockReturnValue(webAiConfig());
        useSettingsUiStore.setState({
            enableNowPlayingStage: true,
            enablePlayerCapStage: false,
            webObsThemeMode: 'builtin',
        });
    });

    const extraOf = () => resolveWebObsTarget()!.extra;

    it('states the selected mode and never emits aiFollow', () => {
        for (const mode of ['static', 'builtin', 'ai'] as const) {
            useSettingsUiStore.setState({ webObsThemeMode: mode });
            const extra = extraOf();
            expect(extra.obsTheme).toBe(mode);
            expect('aiFollow' in extra).toBe(false);
        }
    });

    it('carries no AI params outside the ai mode', () => {
        aiConfigMock.mockReturnValue(webAiConfig({ geminiApiKey: 'secret' }));
        for (const mode of ['static', 'builtin'] as const) {
            useSettingsUiStore.setState({ webObsThemeMode: mode });
            expect(Object.keys(extraOf()).filter(k => k.startsWith('ai'))).toEqual([]);
        }
    });

    it('carries the provider and the gemini key under the ai mode', () => {
        aiConfigMock.mockReturnValue(webAiConfig({ geminiApiKey: 'secret' }));
        useSettingsUiStore.setState({ webObsThemeMode: 'ai' });
        expect(extraOf()).toMatchObject({ obsTheme: 'ai', aiProvider: 'gemini', aiKey: 'secret' });
    });

    // A server-key deploy puts no key in the URL, but the provider still decides which generate
    // endpoint the overlay calls, so it has to ride along regardless.
    it('keeps the provider when there is no key to carry', () => {
        aiConfigMock.mockReturnValue(webAiConfig({ provider: 'openai' }));
        useSettingsUiStore.setState({ webObsThemeMode: 'ai' });
        const extra = extraOf();
        expect(extra).toMatchObject({ obsTheme: 'ai', aiProvider: 'openai' });
        expect('aiKey' in extra).toBe(false);
    });

    it('carries openai url/model only alongside an openai key', () => {
        aiConfigMock.mockReturnValue(webAiConfig({
            provider: 'openai',
            openaiApiKey: 'sk-x',
            openaiApiUrl: 'https://x.test',
            openaiApiModel: 'gpt-x',
        }));
        useSettingsUiStore.setState({ webObsThemeMode: 'ai' });
        expect(extraOf()).toMatchObject({
            obsTheme: 'ai',
            aiProvider: 'openai',
            aiKey: 'sk-x',
            aiUrl: 'https://x.test',
            aiModel: 'gpt-x',
        });
    });
});
