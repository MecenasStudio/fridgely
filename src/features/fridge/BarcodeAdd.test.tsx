import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import i18n from '../../i18n'
import { BarcodeAdd } from './BarcodeAdd'

const noop = async () => {}

function renderAdd(lookup: (code: string) => Promise<{ name: string } | null>, onAdd = vi.fn(noop)) {
  render(<BarcodeAdd onAdd={onAdd} lookup={lookup} />)
  return onAdd
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

describe('BarcodeAdd', () => {
  it('adds a found product with quantity 1 and no expiry date', async () => {
    const lookup = vi.fn(async () => ({ name: 'Mleko 2%' }))
    const onAdd = renderAdd(lookup)

    fireEvent.change(screen.getByLabelText('Barcode'), { target: { value: '5901234123457' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByText('Mleko 2%')).toBeTruthy()
    expect(lookup).toHaveBeenCalledWith('5901234123457')

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).toHaveBeenCalledWith({ name: 'Mleko 2%', quantity: 1, unit: 'szt', expiresOn: null })
  })

  it('passes the chosen expiry date through', async () => {
    const onAdd = renderAdd(async () => ({ name: 'Masło' }))
    fireEvent.change(screen.getByLabelText('Barcode'), { target: { value: '12345678' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByText('Masło')

    fireEvent.change(screen.getByLabelText('Expiry date'), { target: { value: '2026-11-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).toHaveBeenCalledWith({ name: 'Masło', quantity: 1, unit: 'szt', expiresOn: '2026-11-01' })
  })

  it('offers manual entry when the product is unknown', async () => {
    const lookup = vi.fn(async () => null)
    const onAdd = renderAdd(lookup)

    fireEvent.change(screen.getByLabelText('Barcode'), { target: { value: '00000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByText('Product not found. Type the name yourself.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Domowy ser' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).toHaveBeenCalledWith({ name: 'Domowy ser', quantity: 1, unit: 'szt', expiresOn: null })
  })

  it('treats a lookup failure like an unknown product instead of crashing', async () => {
    const lookup = vi.fn(async () => {
      throw new Error('Open Food Facts responded 503')
    })
    renderAdd(lookup)

    fireEvent.change(screen.getByLabelText('Barcode'), { target: { value: '12345678' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByText('Product not found. Type the name yourself.')).toBeTruthy()
  })

  it('alerts and keeps the found product when adding fails', async () => {
    const onAdd = vi.fn(async () => {
      throw new Error('insert failed')
    })
    renderAdd(async () => ({ name: 'Mleko' }), onAdd)

    fireEvent.change(screen.getByLabelText('Barcode'), { target: { value: '12345678' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByText('Mleko')

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Could not add the product. Please try again.')
    // Nothing is cleared, so a second click is the whole retry.
    expect(screen.getByText('Mleko')).toBeTruthy()
    expect((screen.getByLabelText('Barcode') as HTMLInputElement).value).toBe('12345678')
  })

  it('alerts and keeps the typed name when the manual add fails', async () => {
    const onAdd = vi.fn(async () => {
      throw new Error('insert failed')
    })
    renderAdd(async () => null, onAdd)

    fireEvent.change(screen.getByLabelText('Barcode'), { target: { value: '00000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByText('Product not found. Type the name yourself.')

    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Domowy ser' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Could not add the product. Please try again.')).toBeTruthy()
    expect((screen.getByLabelText('Product name') as HTMLInputElement).value).toBe('Domowy ser')
  })

  it('hides the camera button when BarcodeDetector is missing', () => {
    expect('BarcodeDetector' in window).toBe(false)
    renderAdd(async () => null)
    expect(screen.queryByRole('button', { name: 'Scan with camera' })).toBeNull()
  })

  it('shows the camera button and stops the stream after a scan', async () => {
    const stop = vi.fn()
    const track = { stop }
    const stream = { getTracks: () => [track] } as unknown as MediaStream
    const getUserMedia = vi.fn(async () => stream)
    const detect = vi.fn(async () => [{ rawValue: '5901234123457' }])

    class FakeDetector {
      detect = detect
    }
    vi.stubGlobal('BarcodeDetector', FakeDetector)
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
    Object.defineProperty(HTMLMediaElement.prototype, 'play', { value: async () => {}, configurable: true })

    try {
      const lookup = vi.fn(async () => ({ name: 'Mleko' }))
      renderAdd(lookup)

      fireEvent.click(screen.getByRole('button', { name: 'Scan with camera' }))
      await waitFor(() => expect(lookup).toHaveBeenCalledWith('5901234123457'))
      expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'environment' } })
      expect(stop).toHaveBeenCalled()
      expect(await screen.findByText('Mleko')).toBeTruthy()
    } finally {
      vi.unstubAllGlobals()
      Reflect.deleteProperty(navigator, 'mediaDevices')
    }
  })
})
