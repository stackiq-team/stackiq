import 'dotenv/config'
import { Redis } from 'ioredis'

const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379', {
  maxRetriesPerRequest: null
})

redis.on('connect', () => console.log('Worker connected to Redis'))
redis.on('error', (err) => console.error('Worker Redis error:', err))

console.log('Worker started, waiting for jobs...')