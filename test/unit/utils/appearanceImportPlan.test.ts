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

    it('treats the theme as one change and keeps the previous theme as its from-value', () => {
        const current = { theme: { light: { name: 'Mine' }, dark: { name: 'Mine' } } };
        const p = plan({ theme: { light: { name: 'Theirs' }, dark: { name: 'Theirs' } } }, current, unpinned);
        expect(p.changes).toHaveLength(1);
        expect(p.changes[0]).toMatchObject({ group: 'theme', key: 'theme', from: current.theme });
    });
});
