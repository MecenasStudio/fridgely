import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AiError } from '../../lib/ai'
import type { AiLocale, DetectedItem, PhotoPayload } from '../../lib/ai'
import { validateItem } from '../../domain/validate'
import type { NewFridgeItem } from './FridgeItemForm'

export type Recognize = (image: PhotoPayload, locale: AiLocale) => Promise<DetectedItem[]>
export type ReadDate = (image: PhotoPayload, locale: AiLocale) => Promise<string | null>
export type PreparePhoto = (file: Blob) => Promise<PhotoPayload>

type Props = {
  locale: AiLocale
  onAdd(item: NewFridgeItem): Promise<void>
  recognize: Recognize
  readDate: ReadDate
  /** Writes a date read from a label onto an existing product. */
  onUpdateDate(id: string, expiresOn: string): Promise<void>
  /** Product whose date is being read from a label, or null when idle. */
  dateTarget?: { id: string; name: string } | null
  /** Called once a date has been saved or the read was cancelled. */
  onDateDone?(): void
  /** Reports the picked file as a payload; the caller downscales and encodes it. */
  prepare?: PreparePhoto
}

type Row = DetectedItem & { key: number }

/** Photos are the only input here, so the editable list is the whole review step. */
function errorMessageKey(error: unknown): string {
  const code = error instanceof AiError ? error.code : undefined
  if (code === 'NO_API_KEY') return 'photo.noKey'
  if (code === 'UNAUTHENTICATED') return 'photo.sessionExpired'
  return 'photo.failed'
}

export function PhotoImport({
  locale,
  onAdd,
  recognize,
  readDate,
  onUpdateDate,
  dateTarget = null,
  onDateDone,
  prepare,
}: Props) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState(false)
  /** Index of the row that stopped "Add all"; the message names that row. */
  const [invalidRow, setInvalidRow] = useState<number | null>(null)

  const [readBusy, setReadBusy] = useState(false)
  const [labelDate, setLabelDate] = useState<string | null>(null)
  const [dateMissing, setDateMissing] = useState(false)
  const [dateError, setDateError] = useState<string | null>(null)

  async function preparePhoto(file: Blob): Promise<PhotoPayload> {
    if (prepare) return prepare(file)
    const { prepareImage } = await import('../../lib/image')
    return prepareImage(file)
  }

  function patch(key: number, changes: Partial<DetectedItem>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...changes } : row)))
  }

  async function onPhoto(file: File | null | undefined) {
    if (!file || busy) return
    setBusy(true)
    setError(null)
    setAdded(false)
    setRows([])
    try {
      const detected = await recognize(await preparePhoto(file), locale)
      setRows(detected.map((item, index) => ({ ...item, key: index })))
      if (detected.length === 0) setError(t('photo.empty'))
    } catch (cause) {
      setError(t(errorMessageKey(cause)))
    } finally {
      setBusy(false)
    }
  }

  async function addAll() {
    if (adding || rows.length === 0) return
    setError(null)
    setInvalidRow(null)

    // One bad row blocks the whole batch and says which one: half-adding a photo would be
    // harder to undo than asking the user to fix the row.
    const checked = rows.map((row) => validateItem({ name: row.name, quantity: row.quantity, unit: row.unit }))
    const badIndex = checked.findIndex((result) => !result.ok)
    if (badIndex !== -1) {
      setInvalidRow(badIndex)
      return
    }

    setAdding(true)
    try {
      for (let i = 0; i < rows.length; i += 1) {
        const result = checked[i]
        if (!result.ok) continue
        await onAdd({ ...result.value, expiresOn: rows[i].expiresOn })
      }
      setRows([])
      setAdded(true)
    } catch {
      // Nothing is cleared: the list is still there, so retrying is one click.
      setError(t('photo.addFailed'))
    } finally {
      setAdding(false)
    }
  }

  async function onDatePhoto(file: File | null | undefined) {
    // Bail out without touching `readBusy`: a missing file must not lock the reader.
    if (!file || !dateTarget || readBusy) return
    setReadBusy(true)
    setDateError(null)
    setLabelDate(null)
    setDateMissing(false)
    try {
      const date = await readDate(await preparePhoto(file), locale)
      if (date) setLabelDate(date)
      else setDateMissing(true)
    } catch (cause) {
      setDateError(t(errorMessageKey(cause)))
    } finally {
      setReadBusy(false)
    }
  }

  async function saveDate(id: string) {
    if (!labelDate) return
    setDateError(null)
    try {
      await onUpdateDate(id, labelDate)
      setLabelDate(null)
      setDateMissing(false)
      onDateDone?.()
    } catch {
      setDateError(t('photo.saveFailed'))
    }
  }

  return (
    <div>
      <label>
        {t('photo.add')}{' '}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          aria-label={t('photo.add')}
          onChange={(e) => void onPhoto(e.target.files?.[0])}
        />
      </label>

      {busy && <p role="status">{t('photo.working')}</p>}
      {error && <p role="alert">{error}</p>}
      {added && <p role="status">{t('photo.added')}</p>}

      {rows.length > 0 && (
        <div>
          <table>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <input
                      aria-label={t('photo.name')}
                      value={row.name}
                      onChange={(e) => patch(row.key, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      aria-label={t('photo.quantity')}
                      value={row.quantity}
                      onChange={(e) => patch(row.key, { quantity: Number(e.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={t('photo.unit')}
                      value={row.unit}
                      onChange={(e) => patch(row.key, { unit: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      aria-label={t('photo.expiresOn')}
                      value={row.expiresOn ?? ''}
                      onChange={(e) => patch(row.key, { expiresOn: e.target.value || null })}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      aria-label={`${t('photo.remove')} ${row.name}`}
                      onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" disabled={adding} onClick={() => void addAll()}>
            {t('photo.addAll')}
          </button>
          {invalidRow !== null && (
            <p role="alert">{t('photo.invalidRow', { row: invalidRow + 1 })}</p>
          )}
        </div>
      )}

      {dateTarget && (
        <div>
          <label>
            {t('photo.readDate')}{' '}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              aria-label={`${t('photo.readDate')} ${dateTarget.name}`}
              onChange={(e) => void onDatePhoto(e.target.files?.[0])}
            />
          </label>
          {readBusy && <p role="status">{t('photo.reading')}</p>}
          {dateMissing && <p role="alert">{t('photo.noDate')}</p>}
          {dateError && <p role="alert">{dateError}</p>}
          {labelDate && (
            <>
              <p role="status">{t('photo.foundDate', { date: labelDate })}</p>
              <button type="button" onClick={() => void saveDate(dateTarget.id)}>
                {t('photo.saveDate')}
              </button>
            </>
          )}
          <button type="button" onClick={() => onDateDone?.()}>
            {t('photo.cancel')}
          </button>
        </div>
      )}
    </div>
  )
}

/** The per-product "read the date from a photo" button, used by `FridgeView`. */
export function ReadDateButton({ name, onClick }: { name: string; onClick(): void }) {
  const { t } = useTranslation()
  return (
    <button type="button" aria-label={`${t('photo.readDate')} ${name}`} onClick={onClick}>
      {t('photo.readDate')}
    </button>
  )
}
