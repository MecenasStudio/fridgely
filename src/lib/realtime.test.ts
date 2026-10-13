import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { subscribeToHousehold } from './realtime'
import type { HouseholdTable } from './realtime'

/** The stubbed client hands out channels the tests can inspect and fire events at. */
const { db } = vi.hoisted(() => {
  type Payload = { event: '*'; schema: 'public'; table: string; filter: string }
  type Record_ = { name: string; payloads: Payload[]; removed: boolean; emit: () => void }

  const db = { channels: [] as Record_[], removed: [] as unknown[] }

  const channel = (name: string) => {
    const record: Record_ = { name, payloads: [], removed: false, emit: () => {} }
    db.channels.push(record)
    // The real builder returns an object carrying its own name; `removeChannel` needs it.
    const self: { name: string; on: unknown; subscribe: unknown } = {
      name,
      on: (_event: string, payload: Payload, callback: () => void) => {
        record.payloads.push(payload)
        record.emit = callback
        return self
      },
      subscribe: () => self,
    }
    return self
  }

  return { db: { channels: db.channels, removed: db.removed, channel } }
})

vi.mock('./supabase', () => ({
  supabase: {
    channel: (name: string) => db.channel(name),
    removeChannel: (target: unknown) => {
      db.removed.push(target)
      const record = db.channels.find((c) => c.name === (target as { name?: string } | null)?.name)
      if (record) record.removed = true
    },
  },
}))

/** Fires a change event through the callback registered by the last subscription. */
function fireChange() {
  const last = db.channels[db.channels.length - 1]
  last.emit()
}

beforeEach(() => {
  db.channels.length = 0
  db.removed.length = 0
})

afterEach(() => {
  vi.useRealTimers()
})

describe('subscribeToHousehold', () => {
  const tables: HouseholdTable[] = ['fridge_items', 'recipes', 'meal_plan', 'shopping_items']

  it('builds the exact filter and channel name for every table', () => {
    for (const table of tables) {
      db.channels.length = 0
      const cleanup = subscribeToHousehold(table, 'house-1', () => {}, 0)
      const channel = db.channels[0]

      expect(channel.name).toBe(`${table}:house-1`)
      expect(channel.payloads).toEqual([
        { event: '*', schema: 'public', table, filter: 'household_id=eq.house-1' },
      ])
      cleanup()
    }
  })

  it('uses the given household id, so two households never share a filter', () => {
    subscribeToHousehold('fridge_items', 'a', () => {}, 0)
    subscribeToHousehold('fridge_items', 'b', () => {}, 0)

    expect(db.channels.map((c) => c.payloads[0].filter)).toEqual([
      'household_id=eq.a',
      'household_id=eq.b',
    ])
  })

  it('calls the listener once for a burst of events', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    subscribeToHousehold('fridge_items', 'house-1', onChange, 150)

    for (let i = 0; i < 5; i += 1) fireChange()
    expect(onChange).not.toHaveBeenCalled()

    vi.advanceTimersByTime(150)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('calls again for a new burst after the window passed', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    subscribeToHousehold('fridge_items', 'house-1', onChange, 150)

    fireChange()
    vi.advanceTimersByTime(150)
    fireChange()
    vi.advanceTimersByTime(150)

    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('removes the channel and cancels a pending call on cleanup', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const cleanup = subscribeToHousehold('recipes', 'house-1', onChange, 150)

    fireChange()
    cleanup()
    vi.advanceTimersByTime(1000)

    expect(onChange).not.toHaveBeenCalled()
    expect(db.removed).toHaveLength(1)
    expect(db.channels[0].removed).toBe(true)
  })

  it('does nothing after cleanup when an event still arrives', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const cleanup = subscribeToHousehold('shopping_items', 'house-1', onChange, 150)
    const emitAfterCleanup = db.channels[0].emit

    cleanup()
    emitAfterCleanup()
    vi.advanceTimersByTime(1000)

    // The callback was fired by a channel that is already gone: no listener call, and no
    // pending timer left behind.
    expect(onChange).not.toHaveBeenCalled()
  })

  it('defaults the debounce window to 150 ms', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    subscribeToHousehold('meal_plan', 'house-1', onChange)

    fireChange()
    vi.advanceTimersByTime(149)
    expect(onChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
