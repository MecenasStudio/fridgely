import { renderHook, waitFor, act } from '@testing-library/react'
import { useFridge } from './useFridge'

// A chainable stub: `select` resolves with the loaded rows, `insert`/`update` record
// their payload and resolve without error.
const { db } = vi.hoisted(() => {
  const calls = {
    inserts: [] as Record<string, unknown>[],
    updates: [] as Record<string, unknown>[],
    deletes: [] as string[],
    /** Filters passed to `.eq(...)`: the second argument is the id a write targets. */
    eq: [] as [string, unknown][],
    selects: 0,
  }
  const state = { failSelect: false, rows: [] as unknown[] }
  const from = () => {
    const chain: Record<string, unknown> = {}
    const result = () =>
      Promise.resolve(
        state.failSelect && calls.selects > 0
          ? { data: null, error: { message: 'permission denied' } }
          : { data: state.rows, error: null },
      )
    const trackEq = (...args: unknown[]) => {
      calls.eq.push(args as [string, unknown])
      return chain
    }
    Object.assign(chain, {
      select: () => {
        calls.selects += 1
        return chain
      },
      eq: trackEq,
      order: () => chain,
      insert: (row: Record<string, unknown>) => {
        calls.inserts.push(row)
        return Promise.resolve({ data: null, error: null })
      },
      update: (row: Record<string, unknown>) => {
        calls.updates.push(row)
        return chain
      },
      delete: () => {
        const target: Record<string, unknown> = {}
        target.eq = (...args: unknown[]) => {
          calls.deletes.push(String(args[1]))
          return target
        }
        target.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve)
        return target
      },
      then: (resolve: (value: unknown) => unknown) => result().then(resolve),
    })
    return chain
  }
  return { db: { calls, state, from } }
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
  db.calls.deletes.length = 0
  db.calls.eq.length = 0
  db.calls.selects = 0
  db.state.failSelect = false
  db.state.rows = []
})

/** The id a write actually targeted. */
function lastTargetedId(): unknown {
  return db.calls.eq[db.calls.eq.length - 1]?.[1]
}

describe('useFridge loading and errors', () => {
  it('starts loading and reports the rows once they arrive', async () => {
    db.state.rows = [{ id: 'a', name: 'Mleko', quantity: 1, unit: 'l', expires_on: null }]
    const { result } = renderHook(() => useFridge('h1'))

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe(false)
    expect(result.current.items).toHaveLength(1)
  })

  it('reports a failed load and recovers on reload without dropping what it had', async () => {
    db.state.rows = [{ id: 'a', name: 'Mleko', quantity: 1, unit: 'l', expires_on: null }]
    const { result } = renderHook(() => useFridge('h1'))
    await waitFor(() => expect(result.current.items).toHaveLength(1))

    // The next load fails: the error is flagged and the row stays on screen.
    db.state.failSelect = true
    await act(async () => {
      await result.current.reload()
    })
    expect(result.current.error).toBe(true)
    expect(result.current.items).toHaveLength(1)

    // Once the server answers again, reload clears the error.
    db.state.failSelect = false
    await act(async () => {
      await result.current.reload()
    })
    expect(result.current.error).toBe(false)
    expect(result.current.items).toHaveLength(1)
  })
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

describe('useFridge rows with a local id', () => {
  it('reloads and writes to the real row when updating a row added in this session', async () => {
    const { result } = renderHook(() => useFridge('h1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // The product does not exist on the server yet, so `add` inserts it and tracks it as
    // `local-1` until the next load.
    await act(async () => {
      await result.current.add({ name: 'Mleko', quantity: 1, unit: 'l', expiresOn: null })
    })
    const localId = result.current.items[0].id
    expect(localId.startsWith('local-')).toBe(true)

    // The reload inside `update` now finds the row the server created.
    db.state.rows = [{ id: 'server-1', name: 'Mleko', quantity: 1, unit: 'l', expires_on: null }]
    const selectsBefore = db.calls.selects
    await act(async () => {
      await result.current.update(localId, { quantity: 3 })
    })

    expect(db.calls.selects).toBeGreaterThan(selectsBefore)
    expect(lastTargetedId()).toBe('server-1')
    expect(db.calls.updates).toEqual([{ quantity: 3 }])
  })

  it('reloads and deletes the real row when removing a row added in this session', async () => {
    const { result } = renderHook(() => useFridge('h1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.add({ name: 'Jajka', quantity: 6, unit: 'szt', expiresOn: '2026-10-20' })
    })
    const localId = result.current.items[0].id

    db.state.rows = [{ id: 'server-2', name: 'Jajka', quantity: 6, unit: 'szt', expires_on: '2026-10-20' }]
    await act(async () => {
      await result.current.remove(localId)
    })

    expect(db.calls.deletes).toEqual(['server-2'])
    expect(result.current.items).toHaveLength(0)
  })

  it('throws FRIDGE_ROW_NOT_SYNCED when the reload cannot find the row', async () => {
    const { result } = renderHook(() => useFridge('h1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.add({ name: 'Masło', quantity: 1, unit: 'szt', expiresOn: null })
    })
    const localId = result.current.items[0].id

    // The server answers, but without that product (someone deleted it meanwhile).
    db.state.rows = [{ id: 'server-3', name: 'Chleb', quantity: 1, unit: 'szt', expires_on: null }]
    await expect(
      act(async () => {
        await result.current.update(localId, { quantity: 2 })
      }),
    ).rejects.toThrow('FRIDGE_ROW_NOT_SYNCED')

    expect(db.calls.updates).toHaveLength(0)
  })

  it('does not reload for a normal server id', async () => {
    db.state.rows = [{ id: 'server-9', name: 'Mleko', quantity: 1, unit: 'l', expires_on: null }]
    const { result } = renderHook(() => useFridge('h1'))
    await waitFor(() => expect(result.current.items).toHaveLength(1))

    const selectsBefore = db.calls.selects
    await act(async () => {
      await result.current.update('server-9', { quantity: 2 })
    })

    expect(db.calls.selects).toBe(selectsBefore)
    expect(lastTargetedId()).toBe('server-9')
  })
})
