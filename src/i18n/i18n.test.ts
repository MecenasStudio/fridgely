import pl from './pl.json'
import en from './en.json'

function keys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null
      ? keys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  )
}

describe('i18n', () => {
  it('pl and en have the same keys', () => {
    expect(keys(pl).sort()).toEqual(keys(en).sort())
  })
})
