import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkAirJellyAvailable, fetchMoodContext } from '../airjelly'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('AirJelly runtime availability', () => {
  it('skips runtime and mood requests in production', async () => {
    vi.stubEnv('DEV', false)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(await checkAirJellyAvailable()).toBe(false)
    expect(await fetchMoodContext()).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('continues to probe the local proxy in development', async () => {
    vi.stubEnv('DEV', true)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ available: true }),
    })
    vi.stubGlobal('fetch', fetchMock)

    expect(await checkAirJellyAvailable()).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('/api/airjelly-runtime')
  })

  it('treats an unreachable development proxy as unavailable', async () => {
    vi.stubEnv('DEV', true)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    expect(await checkAirJellyAvailable()).toBe(false)
    expect(await fetchMoodContext()).toBeNull()
  })
})
