/** Snapshot font inputs before the lazy Worker starts, without detaching caller bytes.
 * The SDK remains the authority for validating font families and data. */
export function encodeLanguagePacks(packs) {
  if (packs === undefined) return undefined;
  if (!Array.isArray(packs)) return null;
  return packs.map(pack => ({
    fallbackFamilies: pack?.fallbackFamilies == null ? pack?.fallbackFamilies
      : Array.isArray(pack.fallbackFamilies) ? pack.fallbackFamilies.map(family => typeof family === "string" ? family : null) : false,
    fonts: Array.isArray(pack?.fonts) ? pack.fonts.map(font => ({
      family: typeof font?.family === "string" ? font.family : null,
      source: font?.source instanceof URL
        ? { kind: "url", href: font.source.href }
        : font?.source instanceof Uint8Array
          ? { kind: "bytes", data: new Uint8Array(font.source) }
          : { kind: "invalid" },
    })) : null,
  }));
}

export function decodeLanguagePacks(packs) {
  if (!Array.isArray(packs)) return packs;
  return packs.map(pack => ({
    fallbackFamilies: pack.fallbackFamilies,
    fonts: Array.isArray(pack.fonts) ? pack.fonts.map(font => ({
      family: font.family,
      source: font.source.kind === "url" ? new URL(font.source.href) : font.source.data,
    })) : null,
  }));
}

export function serializeError(error) {
  return { name: error?.name ?? "Error", message: error?.message ?? String(error), code: error?.code, details: error?.details, stack: error?.stack };
}

export function restoreError(value) {
  return Object.assign(new Error(value.message), value);
}
