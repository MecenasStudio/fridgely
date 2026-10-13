import { renderHook, waitFor, act } from '@testing-library/react'
import { useFridge } from './useFridge'

// A chainable stub: `select` resolves with the loaded rows, `insert`/`update` record
// their payload and resolve without error.
const { db } = vi.hoisted(() => {
  const calls = { inserts: [] as Record<string, unknown>[], updates: [] as Record<string, unknown>[] }
  const from = () => {
    const chain: Record<string, unknown> = {}
    const result = Promise.resolve({ data: [] as unknown[], error: null })
    Object.assign(chain, {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      insert: (row: Record<string, unknown>) => {
        calls.inserts.push(row)
        return result
      },
      update: (row: Record<string, unknown>) => {
        calls.updates.push(row)
        return chain
      },
      delete: () => chain,
      then: (resolve: (value: unknown) => unknown) => result.then(resolve),
    })
    return chain
  }
  return { db: { calls, from } }
})

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: db.from,
    channel: () => {
      const channel = { on: () => channel, subscribe: () => channel }
      return channel
    },
    removeChannel: () => {},
  },
}))

beforeEach(() => {
  db.calls.inserts.length = 0
  db.calls.updates.length = 0
})

describe('useFridge.add', () => {
  it('inserts a new product once and merges the rest, keeping the total', async () => {
    const { result } = renderHook(() => useFridge('h1'))
    await waitFor(() => expect(result.current.items).toEqual([]))

    await act(async () => {
      await result.current.add({ name: 'Mleko', quantity: 1, unit: 'l', expiresOn: null })
      await result.current.add({ name: 'Mleko', quantity: 2, unit: 'l', expiresOn: null })
      await result.current.add({ name: 'mleko ', quantity: 2, unit: 'l', expiresOn: null })
    })

    // One new row, never two.
    expect(db.calls.inserts).toHaveLength(1)
    expect(db.calls.inserts[0]).toMatchObject({ name: 'Mleko', quantity: 1, unit: 'l', expires_on: null })

    // The two merges count from the previous total: 1 + 2 = 3, then 3 + 2 = 5.
    expect(db.calls.updates.map((row) => row.quantity)).toEqual([3, 5])
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].quantity).toBe(5)
  })

  it('merges a second add of the same product into one row', async () => {
    const { result } = renderHook(() => useFridge('h1'))
    await waitFor(() => expect(result.current.items).toEqual([]))

    await act(async () => {
      await result.current.add({ name: 'Jajka', quantity: 6, unit: 'szt', expiresOn: '2026-10-20' })
      await result.current.add({ name: 'Jajka', quantity: 4, unit: 'szt', expiresOn: '2026-10-20' })
    })

    expect(db.calls.inserts).toHaveLength(1)
    expect(db.calls.updates).toEqual([{ quantity: 10 }])
    expect(result.current.items[0].quantity).toBe(10)
  })

  it('does not merge products with a different unit or date', async () => {
    const { result } = renderHook(() => useFridge('h1'))
    await waitFor(() => expect(result.current.items).toEqual([]))

    await act(async () => {
      await result.current.add({ name: 'Mleko', quantity: 1, unit: 'l', expiresOn: null })
      await result.current.add({ name: 'Mleko', quantity: 1, unit: 'szt', expiresOn: null })
      await result.current.add({ name: 'Mleko', quantity: 1, unit: 'l', expiresOn: '2026-10-20' })
    })

    expect(db.calls.inserts).toHaveLength(3)
    expect(db.calls.updates).toHaveLength(0)
    expect(result.current.items).toHaveLength(3)
  })
})
