import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { lookupBarcode } from '../../lib/openFoodFacts'
import type { NewFridgeItem } from './FridgeItemForm'

type Props = {
  onAdd(item: NewFridgeItem): Promise<void>
  lookup?: typeof lookupBarcode
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

/** Camera scanning needs both the detector and a camera; otherwise we hide the button. */
function cameraSupported(): boolean {
  const nav = navigator as Navigator & { mediaDevices?: { getUserMedia?: unknown } }
  return typeof (window as { BarcodeDetector?: unknown }).BarcodeDetector === 'function'
    && typeof nav.mediaDevices?.getUserMedia === 'function'
}

/** The <video> only exists after the scanning state renders, so wait for the ref. */
async function waitForVideo(ref: { current: HTMLVideoElement | null }): Promise<HTMLVideoElement | null> {
  for (let i = 0; i < 20; i += 1) {
    if (ref.current) return ref.current
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return ref.current
}

export function BarcodeAdd({ onAdd, lookup = lookupBarcode }: Props) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [found, setFound] = useState<{ name: string } | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [searching, setSearching] = useState(false)
  const [expiresOn, setExpiresOn] = useState('')
  const [adding, setAdding] = useState(false)
  const [scanError, setScanError] = useState(false)
  const [scanning, setScanning] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setScanning(false)
  }

  // A stream must never outlive the component: stop every track on unmount.
  useEffect(() => stopStream, [])

  function reset() {
    setFound(null)
    setNotFound(false)
  }

  async function search(rawCode: string) {
    const value = rawCode.trim()
    if (!value || searching) return
    setCode(value)
    setSearching(true)
    reset()
    try {
      const product = await lookup(value)
      if (product) setFound(product)
      else setNotFound(true)
    } catch {
      setNotFound(true)
    } finally {
      setSearching(false)
    }
  }

  async function add(name: string) {
    if (adding) return
    setAdding(true)
    try {
      await onAdd({ name, quantity: 1, unit: 'szt', expiresOn: expiresOn || null })
      setCode('')
      setExpiresOn('')
      reset()
    } finally {
      setAdding(false)
    }
  }

  async function scan() {
    if (scanning) return
    setScanError(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      setScanning(true) // renders the <video> the detector reads from
      const video = await waitForVideo(videoRef)
      if (!video) throw new Error('video element missing')
      video.srcObject = stream
      await video.play().catch(() => {})

      const Detector = (window as unknown as { BarcodeDetector: new (options: { formats: string[] }) => { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> } }).BarcodeDetector
      const detector = new Detector({ formats: FORMATS })
      for (let i = 0; i < 40; i += 1) {
        const results = await detector.detect(video).catch(() => [])
        if (results.length > 0) {
          const value = results[0].rawValue
          stopStream()
          await search(value)
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
      stopStream()
    } catch {
      stopStream()
      setScanError(true)
    }
  }

  return (
    <div>
      <label>
        {t('fridge.barcode')}{' '}
        <input
          aria-label={t('fridge.barcode')}
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </label>{' '}
      <button type="button" disabled={searching} onClick={() => search(code)}>
        {searching ? t('fridge.barcodeSearching') : t('fridge.barcodeSearch')}
      </button>{' '}
      {cameraSupported() && (
        <button type="button" disabled={scanning} onClick={() => void scan()}>
          {t('fridge.barcodeScan')}
        </button>
      )}

      {scanning && <video ref={videoRef} muted playsInline />}
      {scanError && <p>{t('fridge.barcodeScanError')}</p>}

      {found && (
        <div>
          <p>{found.name}</p>
          <label>
            {t('fridge.expiresOn')}{' '}
            <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
          </label>{' '}
          <button type="button" disabled={adding} onClick={() => void add(found.name)}>
            {t('fridge.barcodeAdd')}
          </button>
        </div>
      )}

      {notFound && (
        <div>
          <p>{t('fridge.barcodeNotFound')}</p>
          <ManualName onAdd={add} />
        </div>
      )}
    </div>
  )
}

/** Fallback when the barcode is unknown: the user types the name and picks a date. */
function ManualName({ onAdd }: { onAdd(name: string): Promise<void> }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')

  return (
    <>
      <label>
        {t('fridge.name')}{' '}
        <input aria-label={t('fridge.name')} value={name} onChange={(e) => setName(e.target.value)} />
      </label>{' '}
      <button
        type="button"
        disabled={name.trim().length === 0}
        onClick={() => void onAdd(name.trim()).then(() => setName(''))}
      >
        {t('fridge.barcodeAdd')}
      </button>
    </>
  )
}
