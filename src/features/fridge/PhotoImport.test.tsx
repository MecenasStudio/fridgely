import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import i18n from '../../i18n'
import { AiError } from '../../lib/ai'
import type { DetectedItem } from '../../lib/ai'
import { PhotoImport } from './PhotoImport'

// `lib/ai.ts` imports the Supabase client, which refuses to load without env vars.
// This component never talks to the network (everything is injected), so a stub is enough.
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null }, error: null }) } },
}))

const noop = async () => {}

const detected: DetectedItem[] = [
  { name: 'Mleko', quantity: 1, unit: 'l', expiresOn: null },
  { name: 'Jajka', quantity: 6, unit: 'szt', expiresOn: '2026-10-20' },
]

const prepare = async () => ({ mediaType: 'image/jpeg' as const, data: 'AAAA' })

function pickFile(input: HTMLElement, name = 'fridge.jpg') {
  const file = new File(['x'], name, { type: 'image/jpeg' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
  return file
}

/** A file picker that was closed without choosing anything. */
function pickNoFile(input: HTMLElement) {
  Object.defineProperty(input, 'files', { value: undefined, configurable: true })
  fireEvent.change(input)
}

type Overrides = {
  recognize?: (image: unknown, locale: string) => Promise<DetectedItem[]>
  readDate?: (image: unknown, locale: string) => Promise<string | null>
  onAdd?: (item: unknown) => Promise<void>
  onUpdateDate?: (id: string, date: string) => Promise<void>
  dateTarget?: { id: string; name: string } | null
  onDateDone?: () => void
}

function renderImport(overrides: Overrides = {}) {
  const onAdd = overrides.onAdd ?? vi.fn(noop)
  render(
    <PhotoImport
      locale="en"
      onAdd={onAdd as never}
      recognize={(overrides.recognize ?? (async () => detected)) as never}
      readDate={(overrides.readDate ?? (async () => null)) as never}
      onUpdateDate={(overrides.onUpdateDate ?? vi.fn(noop)) as never}
      dateTarget={overrides.dateTarget ?? null}
      onDateDone={overrides.onDateDone ?? (() => {})}
      prepare={prepare}
    />,
  )
  return { onAdd }
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

describe('PhotoImport', () => {
  it('shows the recognised products in an editable list', async () => {
    const { onAdd } = renderImport()
    pickFile(screen.getByLabelText('Add from a photo'))

    expect(await screen.findByDisplayValue('Mleko')).toBeTruthy()
    expect(screen.getByDisplayValue('Jajka')).toBeTruthy()
    // The date field is per row, so it is scoped to the row it belongs to.
    const milkRow = screen.getByDisplayValue('Mleko').closest('tr') as HTMLElement
    const eggsRow = screen.getByDisplayValue('Jajka').closest('tr') as HTMLElement
    expect((within(milkRow).getByLabelText('Expiry date') as HTMLInputElement).value).toBe('')
    expect((within(eggsRow).getByLabelText('Expiry date') as HTMLInputElement).value).toBe('2026-10-20')
    expect(onAdd).not.toHaveBeenCalled()

    fireEvent.change(screen.getByDisplayValue('Mleko'), { target: { value: 'Mleko 2%' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add all' }))

    // The loop awaits one insert per row, so wait for the whole flow to finish
    // (the confirmation only appears once every row has been written).
    expect(await screen.findByText('Products added to your fridge.')).toBeTruthy()
    expect(onAdd).toHaveBeenCalledTimes(2)
    expect(onAdd).toHaveBeenCalledWith({ name: 'Mleko 2%', quantity: 1, unit: 'l', expiresOn: null })
    expect(onAdd).toHaveBeenCalledWith({ name: 'Jajka', quantity: 6, unit: 'szt', expiresOn: '2026-10-20' })
    await waitFor(() => expect(screen.queryByDisplayValue('Jajka')).toBeNull())
  })

  it('does not add a row the user removed', async () => {
    const { onAdd } = renderImport()
    pickFile(screen.getByLabelText('Add from a photo'))
    await screen.findByDisplayValue('Mleko')

    fireEvent.click(screen.getByRole('button', { name: 'Remove from the list Mleko' }))
    expect(screen.queryByDisplayValue('Mleko')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Add all' }))
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith({ name: 'Jajka', quantity: 6, unit: 'szt', expiresOn: '2026-10-20' })
  })

  it('explains an empty result and offers the manual path', async () => {
    renderImport({ recognize: async () => [] })
    pickFile(screen.getByLabelText('Add from a photo'))

    expect(await screen.findByText('I could not recognise any products. Add them by hand.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add all' })).toBeNull()
  })

  it('maps AI errors to the right messages', async () => {
    const cases: [unknown, string][] = [
      [new AiError('NO_API_KEY'), 'No Claude key yet. Add one in Settings to use AI.'],
      [new AiError('UNAUTHENTICATED'), 'Your session expired. Please sign in again.'],
      [new Error('boom'), 'Could not read the photo. Please try again.'],
    ]
    for (const [error, message] of cases) {
      const { unmount } = render(
        <PhotoImport
          locale="en"
          onAdd={noop as never}
          recognize={async () => {
            throw error
          }}
          readDate={async () => null}
          onUpdateDate={noop}
          prepare={prepare}
        />,
      )
      pickFile(screen.getByLabelText('Add from a photo'))
      expect(await screen.findByText(message)).toBeTruthy()
      expect(screen.queryByText('boom')).toBeNull()
      unmount()
    }
  })

  it('keeps the list and alerts when adding fails', async () => {
    const onAdd = vi.fn(async () => {
      throw new Error('insert denied')
    })
    renderImport({ onAdd })

    pickFile(screen.getByLabelText('Add from a photo'))
    await screen.findByDisplayValue('Mleko')
    fireEvent.click(screen.getByRole('button', { name: 'Add all' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Could not add the products. The list is unchanged.')
    expect(screen.getByDisplayValue('Mleko')).toBeTruthy()
  })

  it('reads a label date and saves it only after confirmation', async () => {
    const onUpdateDate = vi.fn(noop)
    const onDateDone = vi.fn()
    renderImport({ readDate: async () => '2026-11-30', onUpdateDate, dateTarget: { id: 'a', name: 'Mleko' }, onDateDone })

    pickFile(screen.getByLabelText('Read the date from a photo Mleko'))

    expect(await screen.findByText('Date read: 2026-11-30')).toBeTruthy()
    expect(onUpdateDate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Save the date' }))
    await waitFor(() => expect(onUpdateDate).toHaveBeenCalledWith('a', '2026-11-30'))
    expect(onDateDone).toHaveBeenCalled()
  })

  it('reports a label without a readable date and a failed save', async () => {
    const onUpdateDate = vi.fn(async () => {
      throw new Error('update denied')
    })
    const { unmount } = render(
      <PhotoImport
        locale="en"
        onAdd={noop}
        recognize={async () => []}
        readDate={async () => null}
        onUpdateDate={onUpdateDate}
        dateTarget={{ id: 'a', name: 'Mleko' }}
        prepare={prepare}
      />,
    )
    pickFile(screen.getByLabelText('Read the date from a photo Mleko'))
    expect(await screen.findByText('No date found in the photo.')).toBeTruthy()
    unmount()

    render(
      <PhotoImport
        locale="en"
        onAdd={noop}
        recognize={async () => []}
        readDate={async () => '2026-11-30'}
        onUpdateDate={onUpdateDate}
        dateTarget={{ id: 'a', name: 'Mleko' }}
        prepare={prepare}
      />,
    )
    pickFile(screen.getByLabelText('Read the date from a photo Mleko'))
    fireEvent.click(await screen.findByRole('button', { name: 'Save the date' }))
    expect(await screen.findByText('Could not save the date. Please try again.')).toBeTruthy()
    expect(screen.queryByText('update denied')).toBeNull()
  })

  it('shows the reading state and ignores a second pick while the date is loading', async () => {
    // The read never settles: the point is the busy state and the guard behind it.
    const readDate = vi.fn(async () => {
      await new Promise(() => {})
      return '2026-11-30'
    })
    renderImport({ readDate, dateTarget: { id: 'a', name: 'Mleko' } })

    const input = screen.getByLabelText('Read the date from a photo Mleko')
    pickFile(input)

    expect(await screen.findByText('Reading the date…')).toBeTruthy()
    expect(readDate).toHaveBeenCalledTimes(1)

    pickFile(input)
    expect(readDate).toHaveBeenCalledTimes(1)
  })

  it('does not lock the reader when a pick is cancelled', async () => {
    const readDate = vi.fn(async () => '2026-11-30')
    renderImport({ readDate, dateTarget: { id: 'a', name: 'Mleko' } })

    const input = screen.getByLabelText('Read the date from a photo Mleko')
    pickNoFile(input)
    expect(readDate).not.toHaveBeenCalled()
    expect(screen.queryByText('Reading the date…')).toBeNull()

    // A cancelled pick must not leave `readBusy` stuck on, so a real pick still works.
    pickFile(input)
    expect(await screen.findByText('Date read: 2026-11-30')).toBeTruthy()
    expect(readDate).toHaveBeenCalledTimes(1)
  })

  it('shows the loading state while the photo is being read', async () => {
    // The recognition promise never settles: the point is the busy state itself.
    // (What happens after it settles is covered by the tests above.)
    renderImport({ recognize: () => new Promise<DetectedItem[]>(() => {}) })

    pickFile(screen.getByLabelText('Add from a photo'))

    expect(screen.getByText('Reading the photo…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add all' })).toBeNull()
  })

  it('lists the editable fields of a row with a name', async () => {
    renderImport()
    pickFile(screen.getByLabelText('Add from a photo'))
    await screen.findByDisplayValue('Mleko')

    const row = screen.getByDisplayValue('Mleko').closest('tr') as HTMLElement
    expect(within(row).getByLabelText('Quantity')).toBeTruthy()
    expect(within(row).getByLabelText('Unit')).toBeTruthy()
    expect(within(row).getByLabelText('Expiry date')).toBeTruthy()
  })

  it('blocks the whole batch and names the row when one row is invalid', async () => {
    const onAdd = vi.fn(async () => {})
    renderImport({ onAdd })
    pickFile(screen.getByLabelText('Add from a photo'))
    await screen.findByDisplayValue('Mleko')

    // The second row gets a quantity the server would refuse.
    const eggsRow = screen.getByDisplayValue('Jajka').closest('tr') as HTMLElement
    fireEvent.change(within(eggsRow).getByLabelText('Quantity'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add all' }))

    expect(await screen.findByText('Row 2 has invalid data. Fix it and try again.')).toBeTruthy()
    expect(onAdd).not.toHaveBeenCalled()
    // Nothing is cleared, so the user can fix the row and try again.
    expect(screen.getByDisplayValue('Mleko')).toBeTruthy()
    expect(screen.getByDisplayValue('Jajka')).toBeTruthy()
  })

  it('blocks a row whose name is too long', async () => {
    const onAdd = vi.fn(async () => {})
    renderImport({ onAdd })
    pickFile(screen.getByLabelText('Add from a photo'))
    await screen.findByDisplayValue('Mleko')

    fireEvent.change(screen.getByDisplayValue('Mleko'), { target: { value: 'x'.repeat(101) } })
    fireEvent.click(screen.getByRole('button', { name: 'Add all' }))

    expect(await screen.findByText('Row 1 has invalid data. Fix it and try again.')).toBeTruthy()
    expect(onAdd).not.toHaveBeenCalled()
  })
})
