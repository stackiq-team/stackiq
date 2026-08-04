import { beforeEach, describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { app } from '../app'
import { prisma } from '../db/client'
import { redis } from '../redis/client'

vi.mock('../db/client', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([])
  },
  connectDB: vi.fn()
}))

vi.mock('../redis/client', () => ({
  redis: {
    ping: vi.fn().mockResolvedValue('PONG')
  }
}))

describe('GET /health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never)
    vi.mocked(redis.ping).mockResolvedValue('PONG')
  })

  it('returns the correct shape', async () => {
    const res = await request(app).get('/health')

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('status')
    expect(res.body).toHaveProperty('postgres')
    expect(res.body).toHaveProperty('redis')
  })

  it('returns degraded when postgres check fails', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error('db down'))

    const res = await request(app).get('/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      status: 'degraded',
      postgres: 'error',
      redis: 'ok'
    })
  })

  it('returns degraded when redis check fails', async () => {
    vi.mocked(redis.ping).mockRejectedValueOnce(new Error('redis down'))

    const res = await request(app).get('/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      status: 'degraded',
      postgres: 'ok',
      redis: 'error'
    })
  })

  it('returns degraded when both checks fail', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error('db down'))
    vi.mocked(redis.ping).mockRejectedValueOnce(new Error('redis down'))

    const res = await request(app).get('/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      status: 'degraded',
      postgres: 'error',
      redis: 'error'
    })
  })
})