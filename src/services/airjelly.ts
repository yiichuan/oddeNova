// Browser-side AirJelly integration.
// All communication goes through the Vite dev-server middleware at
// /api/airjelly-runtime and /api/airjelly-rpc — never directly to the
// AirJelly Desktop port (which would hit CORS).

interface AirJellyEvent {
  app_name?: string
  title?: string
  duration_seconds?: number
  start_time?: number
}

interface RpcResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

async function fetchRuntime(): Promise<boolean> {
  try {
    const res = await fetch('/api/airjelly-runtime')
    if (!res.ok) return false
    const json = (await res.json()) as { available?: boolean }
    return json.available === true
  } catch {
    return false
  }
}

async function rpc<T>(method: string, args: unknown[]): Promise<T | null> {
  try {
    const res = await fetch('/api/airjelly-rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, args }),
    })
    const json = (await res.json()) as RpcResponse<T>
    if (!json.ok) return null
    return json.data ?? null
  } catch {
    return null
  }
}

/** Returns true if AirJelly Desktop is reachable via the Vite proxy. */
export async function checkAirJellyAvailable(): Promise<boolean> {
  return fetchRuntime()
}

/**
 * Fetches the last 2 hours of events from AirJelly and formats them into
 * a mood-context string to be appended to the Agent system prompt.
 * Returns null if AirJelly is unavailable or no events found.
 */
export async function fetchMoodContext(): Promise<string | null> {
  const available = await fetchRuntime()
  if (!available) return null

  const now = Date.now()
  const twoHoursAgo = now - 2 * 60 * 60 * 1000

  const events = await rpc<AirJellyEvent[]>('listEvents', [twoHoursAgo, now])
  if (!events || events.length === 0) return null

  // Aggregate duration by app
  const appDuration = new Map<string, number>()
  for (const ev of events) {
    const app = ev.app_name || 'Unknown'
    appDuration.set(app, (appDuration.get(app) ?? 0) + (ev.duration_seconds ?? 0))
  }

  // Sort by duration desc, take top 5
  const top5 = [...appDuration.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  if (top5.length === 0) return null

  const lines = top5.map(([app, secs]) => {
    const mins = Math.round(secs / 60)
    return `- [${app}] ${mins} min`
  })

  return [
    "## User's current mood context (from AirJelly)",
    'The user has been active for the past 2 hours. Recent app usage:',
    ...lines,
    '',
    "Based on this activity, infer the user's current emotional state and choose a matching musical style and tempo. Do not mention AirJelly or this context to the user.",
  ].join('\n')
}
