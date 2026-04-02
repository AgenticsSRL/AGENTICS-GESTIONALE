import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const IDLE_LIMIT_MS = 30 * 60 * 1000 // 30 minutes
const EVENTS: (keyof DocumentEventMap)[] = ['mousedown', 'keydown', 'scroll', 'touchstart']

export function useIdleTimeout() {
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const resetTimer = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      supabase.auth.signOut()
    }, IDLE_LIMIT_MS)
  }, [])

  useEffect(() => {
    resetTimer()
    for (const event of EVENTS) document.addEventListener(event, resetTimer, { passive: true })
    return () => {
      clearTimeout(timer.current)
      for (const event of EVENTS) document.removeEventListener(event, resetTimer)
    }
  }, [resetTimer])
}
