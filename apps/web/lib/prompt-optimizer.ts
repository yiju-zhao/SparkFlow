/**
 * Prompt Optimizer - Transforms user questions into effective search keywords
 * with LRU caching to reduce API calls.
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_BASE_URL =
  process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

const OPTIMIZER_SYSTEM_PROMPT = `You are a search query optimizer for a RAG system.

Transform the user's question into optimized English search keywords.

Rules:
1. Extract key concepts and entities
2. Use English keywords (even if original is in another language)
3. Remove filler words (what, how, why, is, are, the)
4. Keep domain-specific terminology
5. Output ONLY the keywords, space-separated
6. Maximum 10 keywords

Example:
- Input: "What are the main benefits of using TypeScript over JavaScript?"
- Output: "TypeScript benefits advantages JavaScript comparison type safety"`;

interface OpenAIChatResponse {
  choices: Array<{ message: { content: string } }>;
}

/**
 * Simple LRU cache implementation for prompt optimization results.
 */
class LRUCache<K, V> {
  private cache = new Map<K, { value: V; timestamp: number }>();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize = 500, ttlMs = 1000 * 60 * 60) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key: K, value: V): void {
    // Delete if exists (to reposition)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { value, timestamp: Date.now() });
  }

  size(): number {
    return this.cache.size;
  }
}

class PromptOptimizer {
  private apiKey: string;
  private baseUrl: string;
  private cache: LRUCache<string, string>;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || OPENAI_API_KEY;
    this.baseUrl = baseUrl || OPENAI_BASE_URL;
    // Cache up to 500 prompts for 1 hour
    this.cache = new LRUCache<string, string>(500, 1000 * 60 * 60);
  }

  async optimize(prompt: string): Promise<string> {
    const trimmed = prompt.trim();
    if (trimmed.length < 10) return prompt;

    // Check cache first
    const cached = this.cache.get(trimmed);
    if (cached) {
      console.log(`Prompt cache hit: "${trimmed.slice(0, 50)}..."`);
      return cached;
    }

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: OPTIMIZER_SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          max_tokens: 100,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        console.error("Prompt optimizer API error:", response.status);
        return prompt;
      }

      const data: OpenAIChatResponse = await response.json();
      const optimized = data.choices?.[0]?.message?.content?.trim();

      if (optimized && optimized.length > 0) {
        console.log(`Prompt optimized: "${prompt}" -> "${optimized}"`);
        // Cache the result
        this.cache.set(trimmed, optimized);
        return optimized;
      }
      return prompt;
    } catch (error) {
      console.error("Prompt optimizer error:", error);
      return prompt;
    }
  }

  /**
   * Get current cache size (for monitoring/debugging)
   */
  getCacheSize(): number {
    return this.cache.size();
  }
}

export const promptOptimizer = new PromptOptimizer();
export { PromptOptimizer };
