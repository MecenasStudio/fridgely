// Is the browser online?
//
// `navigator.onLine` only says whether there is a network interface, not whether Supabase is
// reachable, but it is enough to explain an obviously hopeless save to the user and to keep
// the AI buttons from starting a request that cannot finish.

import { useEffect, useState } from 'react'

function readOnline(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return true
  return navigator.onLine
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(readOnline)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)

    // The events are the source of truth after mount; `navigator.onLine` can change between
    // the first render and the effect without an event reaching us.
    setOnline(readOnline())
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
