const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function assertSlug(slug: string): string {
  const value = slug.trim();
  if (!SLUG.test(value) || value.length > 64) {
    throw new Error(
      "Use a slug of lowercase letters, numbers, and hyphens.",
    );
  }
  return value;
}

export function slugFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return assertSlug(slug);
}
