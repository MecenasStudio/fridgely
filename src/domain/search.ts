// Text matching for the search fields (recipes, fridge).
//
// Users type without diacritics ("zolc" for "żółć") and do not care about case, so both
// sides are folded before comparing: lower-case, then NFD with the combining marks removed.
//
// NFD only helps for letters that decompose (ó -> o + mark). A few letters do not decompose
// at all — Polish "ł" is the common one — so they are mapped by hand afterwards.
const STANDALONE: Record<string, string> = {
  ł: 'l',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
}

export function foldText(text: string): string {
  const decomposed = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  return decomposed.replace(/[łøđðþßæœ]/g, (char) => STANDALONE[char] ?? char)
}

/**
 * True when `text` contains `query`. An empty query matches everything.
 *
 * A plain substring test on the folded text: the brief's example is that "zupa" does *not*
 * match "Żurek z zupą" (that word is "zupą"), while "zolc" does match "żółć".
 */
export function matchesQuery(text: string, query: string): boolean {
  const needle = foldText(query).trim()
  if (needle.length === 0) return true
  return foldText(text).includes(needle)
}
