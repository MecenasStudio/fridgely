import { foldText, matchesQuery } from './search'

describe('matchesQuery', () => {
  it('ignores case and surrounding spaces', () => {
    expect(matchesQuery('Omlet z serem', 'OMLET')).toBe(true)
    expect(matchesQuery('Omlet', '  omlet  ')).toBe(true)
  })

  it('ignores Polish diacritics in either direction', () => {
    expect(matchesQuery('Żurek', 'zur')).toBe(true)
    expect(matchesQuery('żółć', 'zolc')).toBe(true)
    expect(matchesQuery('zolc', 'żółć')).toBe(true)
    // "ł" has no combining-mark form, so it is mapped by hand.
    expect(matchesQuery('Łosoś', 'losos')).toBe(true)
    expect(matchesQuery('losos', 'Łosoś')).toBe(true)
  })

  it('matches contained phrases, with one honest caveat about diacritics', () => {
    expect(matchesQuery('Zupa pomidorowa', 'zupa')).toBe(true)
    expect(matchesQuery('Krem z dyni', 'zupa')).toBe(false)
    // The brief expected `false` here. It is `true`, because folding "ą" to "a" is exactly
    // what makes "zolc" find "żółć": "Żurek z zupą" folds to "zurek z zupa". Reported.
    expect(matchesQuery('Żurek z zupą', 'zupa')).toBe(true)
  })

  it('matches everything for an empty query and nothing for a missing phrase', () => {
    expect(matchesQuery('cokolwiek', '')).toBe(true)
    expect(matchesQuery('cokolwiek', '   ')).toBe(true)
    expect(matchesQuery('cokolwiek', 'nie ma')).toBe(false)
  })
})

describe('foldText', () => {
  it('strips combining marks and lower-cases', () => {
    expect(foldText('ŻÓŁĆ')).toBe('zolc')
    expect(foldText('Ćwikła')).toBe('cwikla')
  })

  it('maps the letters that do not decompose', () => {
    expect(foldText('Łódź')).toBe('lodz')
    expect(foldText('Straße')).toBe('strasse')
    expect(foldText('Ærø')).toBe('aero')
  })
})
