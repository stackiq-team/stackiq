import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { app } from '../app'

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
  it('returns the correct shape', async () => {
    const res = await request(app).get('/health')

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('status')
    expect(res.body).toHaveProperty('postgres')
    expect(res.body).toHaveProperty('redis')
  })
})