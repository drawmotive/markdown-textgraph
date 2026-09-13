/** Snapshot font inputs before the lazy Worker starts, without detaching caller bytes.
 * The SDK remains the authority for validating font families and data. */
export function encodeLanguagePacks(packs) {
  return packs?.map(pack => ({
    ...pack,
    fallbackFamilies: pack.fallbackFamilies ? [...pack.fallbackFamilies] : undefined,
    fonts: pack.fonts?.map(font => ({
      ...font,
      source: font.source instanceof URL
        ? { kind: "url", href: font.source.href }
        : font.source instanceof Uint8Array
          ? { kind: "bytes", data: new Uint8Array(font.source) }
          : { kind: "invalid", data: font.source },
    })),
  }));
}

export function decodeLanguagePacks(packs) {
  return packs?.map(pack => ({
    ...pack,
    fonts: pack.fonts?.map(font => ({
      ...font,
      source: font.source.kind === "url" ? new URL(font.source.href) : font.source.data,
    })),
  }));
}

export function serializeError(error) {
  return { name: error?.name ?? "Error", message: error?.message ?? String(error), code: error?.code, details: error?.details, stack: error?.stack };
}

export function restoreError(value) {
  return Object.assign(new Error(value.message), value);
}
