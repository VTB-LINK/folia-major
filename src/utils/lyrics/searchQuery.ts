// src/utils/lyrics/searchQuery.ts
// Shared helpers for constructing lyric search queries from song metadata.

export const buildLyricSearchQuery = (
    title?: string | null,
    artist?: string | null,
    album?: string | null
): string => {
    return [title, artist, album]
        .map(part => part?.trim())
        .filter((part): part is string => Boolean(part))
        .join(' - ');
};
