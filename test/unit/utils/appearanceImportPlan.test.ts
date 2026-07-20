import { describe, expect, it } from 'vitest';
import { buildImportPlan } from '@/utils/appearanceImportPlan';
import type { ThemePreferenceSwitchState } from '@/services/themePreferences';

// test/unit/utils/appearanceImportPlan.test.ts
// The diff an import would apply, computed before anything is applied. The derived cases matter
// most: accepting a song-theme switch can also unpin a custom theme, which the config never names.

const pinned: ThemePreferenceSwitchState = {
    isCustomThemePreferred: true,
    songThemeAutoSwitchEnabled: false,
    songThemeAutoGenerateEnabled: false,
};
const unpinned: ThemePreferenceSwitchState = {
    isCustomThemePreferred: false,
    songThemeAutoSwitchEnabled: true,
    songThemeAutoGenerateEnabled: false,
};

const plan = (incoming: Record<string, unknown>, current: Record<string, unknown> = {}, switches = pinned) =>
    buildImportPlan({ incoming, current, switches });

const keys = (p: ReturnType<typeof plan>) => p.changes.map(c => c.key);

describe('buildImportPlan', () => {
    it('reports nothing when the incoming config matches the current one', () => {
        const same = { visualizerMode: 'monet', backgroundOpacity: 0.75, lyricsFontScale: 1 };
        const p = plan(same, same, unpinned);
        expect(p.changes).toEqual([]);
        expect(p.groups).toEqual([]);
    });

    it('ignores fields the incoming config does not mention', () => {
        const p = plan({ visualizerMode: 'monet' }, { visualizerMode: 'classic', backgroundOpacity: 0.5 }, unpinned);
        expect(keys(p)).toEqual(['visualizerMode']);
    });

    it('sorts changes into the group they are presented under', () => {
        const p = plan({
            theme: { light: { name: 'X' }, dark: { name: 'Y' } },
            visualizerMode: 'monet',
            lyricsFontScale: 1.25,
            backgroundOpacity: 0.3,
        }, { visualizerMode: 'classic', lyricsFontScale: 1, backgroundOpacity: 0.75 }, unpinned);
        expect(p.groups).toEqual(['theme', 'visualizer', 'fonts', 'background']);
    });

    // Tunings are nested objects; a structural compare keeps an unchanged tuning out of the plan.
    it('compares nested tunings structurally', () => {
        const tuning = { cameraSpeed: 1, motionAmount: 1 };
        expect(plan({ dioramaTuning: { ...tuning } }, { dioramaTuning: tuning }, unpinned).changes).toEqual([]);
        expect(keys(plan({ dioramaTuning: { ...tuning, cameraSpeed: 2 } }, { dioramaTuning: tuning }, unpinned)))
            .toEqual(['dioramaTuning']);
    });

    // The import applies the bundle instead of the individual tunings, so listing both would promise
    // a change that never lands.
    it('drops the per-renderer tunings when the bundle is present', () => {
        const incoming = {
            visualizerTunings: { classic: { wordSpacing: 0.9 } },
            classicTuning: { wordSpacing: 0.9 },
            dioramaTuning: { cameraSpeed: 2 },
            monetTuning: { fontScale: 1.5 },
            monetBackgroundTuning: { backgroundBlurPx: 9 },
        };
        expect(keys(plan(incoming, {}, unpinned))).toEqual(['visualizerTunings', 'monetBackgroundTuning']);
    });

    it('keeps the per-renderer tunings when there is no bundle', () => {
        const p = plan({ classicTuning: { wordSpacing: 0.9 }, dioramaTuning: { cameraSpeed: 2 } }, {}, unpinned);
        expect(keys(p)).toEqual(['classicTuning', 'dioramaTuning']);
    });

    // buildVisualSettingsConfig reports null for an uploaded font, so without the label the row
    // would claim the user has no font while the picker shows one.
    it('names the font the picker shows as the from-value', () => {
        const p = buildImportPlan({
            incoming: { lyricsCustomFontFamily: 'Comic Sans MS' },
            current: { lyricsCustomFontFamily: null },
            switches: unpinned,
            customFontSource: 'uploaded',
            customFontLabel: 'DFGKaiSho-XB',
        });
        expect(p.changes.find(c => c.key === 'lyricsCustomFontFamily'))
            .toMatchObject({ from: 'DFGKaiSho-XB', to: 'Comic Sans MS' });
    });

    it('reports no font change when the incoming family is the one already shown', () => {
        const p = buildImportPlan({
            incoming: { lyricsCustomFontFamily: 'DFGKaiSho-XB' },
            current: { lyricsCustomFontFamily: null },
            switches: unpinned,
            customFontLabel: 'DFGKaiSho-XB',
        });
        expect(p.changes.some(c => c.key === 'lyricsCustomFontFamily')).toBe(false);
    });

    it('flags an incoming font this machine cannot render', () => {
        const unavailable = buildImportPlan({
            incoming: { lyricsCustomFontFamily: 'Comic Sans MS' },
            current: {},
            switches: unpinned,
            incomingFontAvailable: false,
        });
        expect(unavailable.changes.find(c => c.key === 'lyricsCustomFontFamily')?.note).toBe('fontUnavailable');

        // Available, and not measured at all, both stay quiet.
        for (const incomingFontAvailable of [true, undefined]) {
            const p = buildImportPlan({
                incoming: { lyricsCustomFontFamily: 'Comic Sans MS' },
                current: {},
                switches: unpinned,
                incomingFontAvailable,
            });
            expect(p.changes.find(c => c.key === 'lyricsCustomFontFamily')?.note).toBeUndefined();
        }
    });

    // Only a system family is portable, so the config can never carry the uploaded font it evicts.
    it('warns that accepting a font family discards an uploaded one', () => {
        const p = buildImportPlan({
            incoming: { lyricsCustomFontFamily: 'Comic Sans MS' },
            current: {},
            switches: unpinned,
            customFontSource: 'uploaded',
        });
        expect(p.changes).toContainEqual({
            group: 'fonts',
            key: 'uploadedLyricsFont',
            from: true,
            to: false,
            derived: true,
        });
    });

    it('does not warn about an uploaded font when there is none', () => {
        for (const customFontSource of ['system', null, undefined] as const) {
            const p = buildImportPlan({
                incoming: { lyricsCustomFontFamily: 'Comic Sans MS' },
                current: {},
                switches: unpinned,
                customFontSource,
            });
            expect(p.changes.some(c => c.key === 'uploadedLyricsFont')).toBe(false);
        }
    });

    it('surfaces the unpinning that accepting auto-switch implies', () => {
        const p = plan({ songThemeAutoSwitchEnabled: true, songThemeAutoGenerateEnabled: false }, {}, pinned);
        const derived = p.changes.find(c => c.derived);
        expect(derived).toMatchObject({
            group: 'songTheme',
            key: 'isCustomThemePreferred',
            from: true,
            to: false,
        });
    });

    // The pin only survives when the config asks for both switches off.
    it('reports no derived change when the config turns the automation off', () => {
        const p = plan({ songThemeAutoSwitchEnabled: false, songThemeAutoGenerateEnabled: false }, {}, pinned);
        expect(p.changes.some(c => c.derived)).toBe(false);
    });

    it('reports no derived change when nothing was pinned to begin with', () => {
        const p = plan({ songThemeAutoSwitchEnabled: true, songThemeAutoGenerateEnabled: true }, {}, unpinned);
        expect(p.changes.some(c => c.derived)).toBe(false);
    });

    // Threading matters: auto-generate on force-enables auto-switch, so the pin goes even when the
    // config's own auto-switch value is what the user already has.
    it('threads the resolvers so auto-generate can unpin on its own', () => {
        const p = plan({ songThemeAutoGenerateEnabled: true }, {}, pinned);
        expect(p.changes.find(c => c.derived)).toMatchObject({ key: 'isCustomThemePreferred', to: false });
    });

    const side = (accentColor: string) => ({
        backgroundColor: '#000000',
        primaryColor: '#ffffff',
        accentColor,
        secondaryColor: '#888888',
        fontStyle: 'sans',
        animationIntensity: 'normal',
    });

    // Offered per side so someone's night colours can be taken without their day ones.
    it('splits the theme into a light and a dark row', () => {
        const current = { theme: { light: side('#111111'), dark: side('#111111') } };
        const p = plan({ theme: { light: side('#ea580c'), dark: side('#0df1fe') } }, current, unpinned);
        expect(keys(p)).toEqual(['themeLight', 'themeDark']);
        expect(p.changes[0]).toMatchObject({ from: current.theme.light, to: side('#ea580c') });
    });

    it('offers only the side that actually differs', () => {
        const p = plan(
            { theme: { light: side('#ea580c'), dark: side('#0df1fe') } },
            { theme: { light: side('#ea580c'), dark: side('#111111') } },
            unpinned,
        );
        expect(keys(p)).toEqual(['themeDark']);
        expect(p.unchanged.map(c => c.key)).toEqual(['themeLight']);
    });

    // A saved theme carries provider/description and empty word-colour lists that a hand-written or
    // freshly decoded one does not. Reporting those would claim a change the user cannot see.
    it('ignores theme metadata and empty-vs-absent lists', () => {
        const saved = {
            backgroundColor: '#f5f5f4', primaryColor: '#1c1917', accentColor: '#ea580c', secondaryColor: '#44403c',
            fontStyle: 'sans', animationIntensity: 'normal', wordColors: [], lyricsIcons: [], provider: 'Custom', description: '',
        };
        const incoming = {
            name: 'Whatever Else', backgroundColor: '#f5f5f4', primaryColor: '#1c1917', accentColor: '#ea580c',
            secondaryColor: '#44403c', fontStyle: 'sans', animationIntensity: 'normal',
        };
        const p = plan({ theme: { light: incoming, dark: incoming } }, { theme: { light: saved, dark: saved } }, unpinned);
        expect(p.changes).toEqual([]);
        expect(p.unchanged.map(c => c.key)).toEqual(['themeLight', 'themeDark']);
    });

    it('still reports a theme side whose colours differ', () => {
        const base = { backgroundColor: '#000', primaryColor: '#fff', accentColor: '#ea580c', secondaryColor: '#888', fontStyle: 'sans', animationIntensity: 'normal' };
        const p = plan(
            { theme: { light: base, dark: { ...base, accentColor: '#0df1fe' } } },
            { theme: { light: { ...base, provider: 'Custom' }, dark: { ...base, provider: 'Custom' } } },
            unpinned,
        );
        expect(keys(p)).toEqual(['themeDark']);
    });

    // "Not listed" must never be ambiguous between "absent from the config" and "already equal".
    it('reports matching fields as unchanged rather than dropping them', () => {
        const p = plan(
            { visualizerMode: 'monet', backgroundOpacity: 0.5 },
            { visualizerMode: 'monet', backgroundOpacity: 0.75 },
            unpinned,
        );
        expect(keys(p)).toEqual(['backgroundOpacity']);
        expect(p.unchanged.map(c => c.key)).toEqual(['visualizerMode']);
        expect(p.unchanged[0]).toMatchObject({ from: 'monet', to: 'monet' });
    });

    it('does not flag an unavailable font on a row that is not changing', () => {
        const p = buildImportPlan({
            incoming: { lyricsCustomFontFamily: 'Same Font' },
            current: {},
            switches: unpinned,
            customFontLabel: 'Same Font',
            incomingFontAvailable: false,
        });
        expect(p.changes).toEqual([]);
        expect(p.unchanged[0]?.note).toBeUndefined();
    });
});
