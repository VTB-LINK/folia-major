import { describe, expect, it } from 'vitest';
import { resolveSettingLabelKey } from '@/utils/settingLabelLookup';
import zhCN from '@/i18n/locales/zh-CN';

// test/unit/utils/settingLabelLookup.test.ts
// Deriving a panel's own label key from a tuning field, instead of copying the pairs into a table
// that grows with every new slider. The keys below are the real ones from the locale files, so this
// also pins the naming patterns the resolver relies on.

const REAL_KEYS = new Set([
    'options.monetBackgroundSource',
    'options.monetBackgroundLayout',
    'options.monetHalfPaneOffsetX',
    'options.monetBackgroundBlur',
    'options.monetBackgroundOverlayOpacity',
    'options.monetBackgroundGrayscale',
    'options.monetBackgroundSaturation',
    'options.monetBackgroundWash',
    'options.monetBackgroundWashColorMode',
    'options.latentDitheringSize',
    'options.latentDitheringOpacity',
    'options.latentMeshSwirl',
    'options.monetPortraitSource',
    'options.monetAudioStyle',
]);

const has = (key: string) => REAL_KEYS.has(key);
const resolve = (owner: string, leaf: string) => resolveSettingLabelKey(owner, leaf, has);

describe('resolveSettingLabelKey', () => {
    // prefix + field name, unchanged.
    it('finds a key that is just the prefix and the field', () => {
        expect(resolve('monetBackgroundTuning', 'backgroundSaturation')).toBe('options.monetBackgroundSaturation');
        expect(resolve('monetBackgroundTuning', 'backgroundWash')).toBe('options.monetBackgroundWash');
    });

    // The panel drops the unit because the slider prints it next to the value.
    it('finds a key whose field lost its unit suffix', () => {
        expect(resolve('monetBackgroundTuning', 'backgroundBlurPx')).toBe('options.monetBackgroundBlur');
    });

    // The prefix already says "background", so the panel does not repeat it.
    it('finds a key whose field dropped a segment the prefix already carries', () => {
        expect(resolve('monetBackgroundTuning', 'backgroundHalfPaneOffsetX')).toBe('options.monetHalfPaneOffsetX');
    });

    it('resolves other tunings by the same rules', () => {
        expect(resolve('latentBackgroundTuning', 'ditheringSize')).toBe('options.latentDitheringSize');
        expect(resolve('latentBackgroundTuning', 'meshSwirl')).toBe('options.latentMeshSwirl');
        expect(resolve('monetTuning', 'portraitSource')).toBe('options.monetPortraitSource');
        expect(resolve('monetTuning', 'audioStyle')).toBe('options.monetAudioStyle');
    });

    // Nested groups are labelled by their own leaf.
    it('uses the last segment of a nested path', () => {
        expect(resolve('monetBackgroundTuning', 'group.backgroundSaturation')).toBe('options.monetBackgroundSaturation');
    });

    // A guess must never be shown as if it were a label.
    it('returns null when the panel has no label for the field', () => {
        expect(resolve('monetBackgroundTuning', 'somethingNobodyNamed')).toBeNull();
        expect(resolve('dioramaTuning', 'soulIntensity')).toBeNull();
    });

    it('never returns a key the caller said does not exist', () => {
        expect(resolveSettingLabelKey('monetBackgroundTuning', 'backgroundSaturation', () => false)).toBeNull();
    });
});

// Against the shipped locale rather than a stand-in, so a panel that renames its keys fails here
// instead of quietly falling back to field names in the dialog.
describe('resolveSettingLabelKey against the real locale', () => {
    const options = (zhCN as { options: Record<string, string>; }).options;
    const existsForReal = (key: string) => Object.prototype.hasOwnProperty.call(options, key.replace(/^options\./, ''));
    const label = (owner: string, leaf: string) => {
        const key = resolveSettingLabelKey(owner, leaf, existsForReal);
        return key ? options[key.replace(/^options\./, '')] : null;
    };

    it('names every monet background field the panel exposes', () => {
        expect(label('monetBackgroundTuning', 'backgroundLayout')).toBe('布局模式');
        expect(label('monetBackgroundTuning', 'backgroundHalfPaneOffsetX')).toBe('图片水平偏移');
        expect(label('monetBackgroundTuning', 'backgroundBlurPx')).toBe('背景模糊');
        expect(label('monetBackgroundTuning', 'backgroundSaturation')).toBe('饱和度');
        expect(label('monetBackgroundTuning', 'backgroundGrayscale')).toBe('去色');
        expect(label('monetBackgroundTuning', 'backgroundOverlayOpacity')).toBe('主题叠色强度');
        expect(label('monetBackgroundTuning', 'backgroundWash')).toBe('水洗重着色');
        expect(label('monetBackgroundTuning', 'backgroundSource')).toBe('背景来源');
    });

    it('reaches other tunings without any per-field wiring', () => {
        expect(label('latentBackgroundTuning', 'ditheringSize')).toBe('像素尺寸');
        expect(label('latentBackgroundTuning', 'meshSwirl')).toBe('流体旋涡');
        expect(label('monetTuning', 'portraitSource')).toBe('右侧肖像来源');
        expect(label('monetTuning', 'audioStyle')).toBe('频谱样式');
    });
});
