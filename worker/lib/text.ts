/** Lower-case, strip accents and punctuation, collapse whitespace. */
export function normalise(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function slugify(s: string): string {
  return normalise(s).replace(/ /g, '-');
}
