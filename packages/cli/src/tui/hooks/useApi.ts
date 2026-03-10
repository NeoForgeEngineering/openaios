import type { LogEntry } from '@openaios/core'
import { useEffect, useState } from 'react'

export function useApiPolling<T>(url: string, intervalMs = 3000): T | null {
  const [data, setData] = useState<T | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchData = () => {
      fetch(url)
        .then((r) => r.json() as Promise<T>)
        .then((d) => {
          if (!cancelled) setData(d)
        })
        .catch(() => {
          /* ignore */
        })
    }

    fetchData()
    const id = setInterval(fetchData, intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [url, intervalMs])

  return data
}

export function useApiLogs(baseUrl: string): LogEntry[] {
  const [logs, setLogs] = useState<LogEntry[]>([])

  useEffect(() => {
    let cancelled = false

    const fetchLogs = () => {
      fetch(`${baseUrl}/api/logs`)
        .then((r) => r.json() as Promise<{ entries: LogEntry[] }>)
        .then((d) => {
          if (!cancelled) setLogs(d.entries?.slice(-50) ?? [])
        })
        .catch(() => {
          /* ignore */
        })
    }

    fetchLogs()
    const id = setInterval(fetchLogs, 1000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [baseUrl])

  return logs
}
