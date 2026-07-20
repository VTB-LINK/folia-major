// src/utils/settingLabelLookup.ts
// Find the label a settings panel already uses for one field of a tuning object.
//
// The panels declare nothing: a slider is `<SliderControl label={t('options.monetBackgroundBlur')}
// onChange={v => onTuningChange({ backgroundBlurPx: v })} />`, so the field and its label only meet
// inside JSX. Hand-copying that into a table would duplicate a mapping that already exists and grow
// by a line for every new slider.
//
// The naming is not uniform but it is patterned: a prefix taken from the tuning, and the field name
// with the noise that panels drop (a unit suffix, a segment the prefix already says). So generate
// the plausible keys and keep the first one i18n actually has. A miss returns null and the caller
// falls back to the field name — a guess is never displayed as if it were a label.

// Suffixes panels leave out because the value's unit is shown next to the slider instead.
const UNIT_SUFFIXES = ['Px', 'Deg', 'Sec', 'Ms'];

const capitalize = (value: string) => (value ? value[0].toUpperCase() + value.slice(1) : value);
const decapitalize = (value: string) => (value ? value[0].toLowerCase() + value.slice(1) : value);

// `monetBackgroundTuning` reads as both `monetBackground` and `monet` in key names, and either can
// be the one that was used.
const prefixesFor = (ownerField: string): string[] => {
    const stem = ownerField.replace(/Tuning$/, '');
    const prefixes = [stem];
    const shortened = stem.replace(/Background$/, '');
    if (shortened && shortened !== stem) prefixes.push(shortened);
    return prefixes;
};

// `backgroundBlurPx` is also worth trying as `backgroundBlur`, `blurPx` and `blur`: the prefix may
// already carry the segment the field repeats.
const leafVariantsFor = (leaf: string): string[] => {
    const variants = new Set<string>([leaf]);

    for (const suffix of UNIT_SUFFIXES) {
        if (leaf.endsWith(suffix) && leaf.length > suffix.length) variants.add(leaf.slice(0, -suffix.length));
    }

    for (const variant of [...variants]) {
        const match = variant.match(/^([a-z]+)([A-Z].*)$/);
        if (match) variants.add(decapitalize(match[2]));
    }

    return [...variants];
};

/**
 * The i18n key a settings panel uses for `leafPath` inside `ownerField`, or null when nothing
 * matches. `hasKey` decides existence so this stays pure and testable.
 */
export function resolveSettingLabelKey(
    ownerField: string,
    leafPath: string,
    hasKey: (key: string) => boolean,
): string | null {
    // Nested groups are labelled by their own leaf; the enclosing group rarely has a key of its own.
    const leaf = leafPath.split('.').pop() ?? leafPath;
    if (!leaf) return null;

    for (const prefix of prefixesFor(ownerField)) {
        for (const variant of leafVariantsFor(leaf)) {
            const key = `options.${prefix}${capitalize(variant)}`;
            if (hasKey(key)) return key;
        }
    }

    // Some fields are named the same in the panel as in the store, with no prefix at all.
    for (const variant of leafVariantsFor(leaf)) {
        const key = `options.${variant}`;
        if (hasKey(key)) return key;
    }

    return null;
}
