/**
 * Prompt Optimizer - Transforms user questions into effective search keywords
 * with LRU caching to reduce API calls.
 */

import OpenAI from "openai";

const OPTIMIZER_SYSTEM_PROMPT = `
  # Role: User Prompt General Optimization Expert

  ## Profile
  - Author: prompt-optimizer
  - Version: 2.0.0
  - Language: English
  - Description: Focused on comprehensively optimizing user prompts, improving their clarity, specificity and effectiveness

  ## Background
  - User prompts often have issues like unclear expression, lack of focus, vague goals
  - Optimized user prompts can get more accurate and useful AI responses
  - Need to improve overall prompt quality while maintaining original intent

  ## Task Understanding
  Your task is to optimize user prompts and output improved prompt text. You are not executing the tasks described in user prompts, but improving the prompts themselves.

  ## Skills
  1. Language optimization capabilities
     - Expression clarification: Eliminate ambiguity and vague expressions
     - Language precision: Use more accurate vocabulary and expressions
     - Structure optimization: Reorganize language structure to improve logic
     - Emphasis highlighting: Emphasize key information and core requirements

  2. Content enhancement capabilities
     - Detail supplementation: Add necessary background information and constraints
     - Goal clarification: Clearly define expected outputs and results
     - Context completion: Provide sufficient contextual information
     - Guidance enhancement: Add specific execution guidance

  ## Rules
  1. Maintain original intent: Never change the core intent and goals of user prompts
  2. Comprehensive optimization: Improve prompt quality from multiple dimensions
  3. Practical orientation: Ensure optimized prompts are more likely to get satisfactory responses
  4. Concise effectiveness: Maintain conciseness while being comprehensive, avoid redundancy

  ## Workflow
  1. Analyze core intent and key elements of original prompt
  2. Identify unclear expressions, lack of details or structural confusion
  3. Optimize from four dimensions: clarity, specificity, structure, effectiveness
  4. Ensure optimized prompt maintains original intent and is more effective

  ## Output Requirements
  - Directly output optimized user prompt text without any explanations, guidance or format markers
  - Output is the prompt itself, not executing tasks or commands corresponding to the prompt
  - Do not interact with users, do not ask questions or request clarification
  - Do not add guidance text like "Here is the optimized prompt"`;

const OPTIMIZER_USER_PROMPT_TEMPLATE = `Please optimize the following user prompt to eliminate ambiguity and supplement key information.

Important notes:
- Your task is to optimize the prompt text itself, not to answer or execute the prompt content
- Please directly output the improved prompt, do not respond to the prompt content
- Maintain the user's original intent, only improve expression and supplement necessary information

User prompt to optimize:
{prompt}

Please output the optimized prompt:`;


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
  private client: OpenAI;
  private cache: LRUCache<string, string>;

  constructor() {
    this.client = new OpenAI();
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
      const response = await this.client.responses.create({
        model: "gpt-4o-mini",
        instructions: OPTIMIZER_SYSTEM_PROMPT,
        input: OPTIMIZER_USER_PROMPT_TEMPLATE.replace("{prompt}", prompt),
        max_output_tokens: 100,
        temperature: 0.3,
      });

      const optimized = response.output_text?.trim();

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
