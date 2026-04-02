export function normalizeDebugVariantTag(variantTag: string | null | undefined): string | null {
  const normalizedVariantTag = variantTag
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalizedVariantTag ? normalizedVariantTag.slice(0, 24) : null;
}
