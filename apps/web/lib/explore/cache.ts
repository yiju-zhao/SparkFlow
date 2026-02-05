// apps/web/lib/explore/cache.ts

import { LRUCache } from 'lru-cache'
import type { FilterOptions } from './types'

export const filterOptionsCache = new LRUCache<string, FilterOptions>({
  max: 10,
  ttl: 5 * 60 * 1000 // 5 minutes
})

export const statsCache = new LRUCache<string, unknown>({
  max: 50,
  ttl: 5 * 60 * 1000 // 5 minutes
})
