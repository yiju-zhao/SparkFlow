/**
 * Crawl4AI Client
 *
 * Converts webpages to markdown using self-hosted Crawl4AI server.
 * Uses the /crawl endpoint with PruningContentFilter for clean, LLM-ready markdown.
 *
 * Compatible with Crawl4AI Docker server API.
 */

const CRAWL4AI_BASE_URL =
  process.env.CRAWL4AI_BASE_URL || "http://localhost:11235";
const CRAWL4AI_API_KEY = process.env.CRAWL4AI_API_KEY || "";

// Content filter types
export type ContentFilterType = "pruning" | "bm25" | "none";

// Filter types for /md endpoint
export type MdFilterType = "raw" | "fit" | "bm25";

// Browser configuration (matches BrowserConfig.dump() output)
interface BrowserConfig {
  headless?: boolean;
  verbose?: boolean;
  extra_args?: string[];
  user_agent?: string;
  proxy?: string;
  viewport?: { width: number; height: number };
}

// Content filter configuration (matches Python class serialization)
interface PruningContentFilter {
  type: "PruningContentFilter";
  threshold?: number;
  threshold_type?: "fixed" | "dynamic";
  min_word_threshold?: number;
}

interface BM25ContentFilter {
  type: "BM25ContentFilter";
  user_query: string;
  bm25_threshold?: number;
}

type ContentFilter = PruningContentFilter | BM25ContentFilter;

// Markdown generator configuration
interface MarkdownGenerator {
  type: "DefaultMarkdownGenerator";
  content_filter?: ContentFilter;
}

// Crawler run configuration (matches CrawlerRunConfig.dump() output)
interface CrawlerRunConfig {
  cache_mode?: "enabled" | "disabled" | "bypass" | "write_only" | "read_only";
  markdown_generator?: MarkdownGenerator;
  wait_until?: "load" | "domcontentloaded" | "networkidle0" | "networkidle2";
  page_timeout?: number;
  verbose?: boolean;
  screenshot?: boolean;
  pdf?: boolean;
  wait_for?: string;
  js_code?: string | string[];
  css_selector?: string;
  excluded_tags?: string[];
  exclude_external_links?: boolean;
  exclude_social_media_links?: boolean;
  process_iframes?: boolean;
}

// Crawl request body (matches CrawlRequestWithHooks schema)
interface CrawlRequest {
  urls: string[];
  crawler_config?: CrawlerRunConfig;
  browser_config?: BrowserConfig;
}

// Markdown request body for /md endpoint
interface MarkdownRequest {
  url: string;
  f?: MdFilterType; // Filter type: raw, fit, or bm25
  q?: string; // Query for bm25 filtering
  c?: boolean; // Use cache
}

// Markdown response from /md endpoint
interface MarkdownResponse {
  url: string;
  filter: MdFilterType;
  query: string | null;
  cache: boolean;
  markdown: string;
  success: boolean;
}

// Markdown result from crawl
interface MarkdownResult {
  raw_markdown: string;
  markdown_with_citations: string;
  references_markdown: string;
  fit_markdown?: string;
  fit_html?: string;
}

// Full crawl result
interface CrawlResult {
  url: string;
  success: boolean;
  html?: string;
  cleaned_html?: string;
  markdown?: MarkdownResult;
  links?: {
    internal: Array<{ href: string; text: string }>;
    external: Array<{ href: string; text: string }>;
  };
  metadata?: {
    title?: string;
    description?: string;
    author?: string;
  };
  error_message?: string;
}

// Crawl response
interface CrawlResponse {
  results: CrawlResult[];
}

// Options for getMarkdownAsFile
interface GetMarkdownOptions {
  filename?: string;
  filterType?: ContentFilterType;
  pruningThreshold?: number;
  bm25Query?: string;
  bm25Threshold?: number;
  useCache?: boolean;
  useMdEndpoint?: boolean; // Use simpler /md endpoint instead of /crawl
}

class Crawl4AIClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl?: string, apiKey?: string) {
    this.baseUrl = baseUrl || CRAWL4AI_BASE_URL;
    this.apiKey = apiKey || CRAWL4AI_API_KEY;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };

    // Add authorization if API key is configured
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Crawl4AI API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    return response.json();
  }

  /**
   * Get markdown using the simple /md endpoint
   * This is the recommended approach for basic webpage-to-markdown conversion.
   *
   * @param url - URL to convert
   * @param filter - Filter type: "raw" (full), "fit" (heuristic filtered), "bm25" (query-based)
   * @param query - Query string for bm25 filtering
   * @param useCache - Whether to use cached results
   */
  async getMarkdown(
    url: string,
    filter: MdFilterType = "fit",
    query?: string,
    useCache: boolean = true
  ): Promise<MarkdownResponse> {
    const body: MarkdownRequest = {
      url,
      f: filter,
      c: useCache,
    };

    if (query && filter === "bm25") {
      body.q = query;
    }

    return this.request<MarkdownResponse>("/md", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Crawl URLs with content filtering and get markdown
   *
   * @param urls - URLs to crawl
   * @param crawlerConfig - Crawler configuration
   * @param browserConfig - Browser configuration
   */
  async crawl(
    urls: string[],
    crawlerConfig?: CrawlerRunConfig,
    browserConfig?: BrowserConfig
  ): Promise<CrawlResponse> {
    const body: CrawlRequest = {
      urls,
    };

    if (crawlerConfig) {
      body.crawler_config = crawlerConfig;
    }

    if (browserConfig) {
      body.browser_config = browserConfig;
    }

    return this.request<CrawlResponse>("/crawl", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Crawl a URL with PruningContentFilter for clean markdown
   *
   * @param url - URL to crawl
   * @param threshold - Pruning threshold (default: 0.48)
   * @param useCache - Whether to use cache (default: true)
   */
  async crawlWithPruning(
    url: string,
    threshold: number = 0.48,
    useCache: boolean = true
  ): Promise<CrawlResult> {
    const crawlerConfig: CrawlerRunConfig = {
      cache_mode: useCache ? "enabled" : "disabled",
      markdown_generator: {
        type: "DefaultMarkdownGenerator",
        content_filter: {
          type: "PruningContentFilter",
          threshold,
          threshold_type: "fixed",
          min_word_threshold: 0,
        },
      },
    };

    const browserConfig: BrowserConfig = {
      headless: true,
      verbose: false,
    };

    const response = await this.crawl([url], crawlerConfig, browserConfig);

    if (!response.results || response.results.length === 0) {
      throw new Error("No results returned from crawl");
    }

    const result = response.results[0];
    if (!result.success) {
      throw new Error(result.error_message || "Crawl failed");
    }

    return result;
  }

  /**
   * Crawl a URL with BM25ContentFilter for query-focused markdown
   *
   * @param url - URL to crawl
   * @param query - Query string for BM25 filtering
   * @param threshold - BM25 threshold (default: 1.0)
   * @param useCache - Whether to use cache (default: true)
   */
  async crawlWithBM25(
    url: string,
    query: string,
    threshold: number = 1.0,
    useCache: boolean = true
  ): Promise<CrawlResult> {
    const crawlerConfig: CrawlerRunConfig = {
      cache_mode: useCache ? "enabled" : "disabled",
      markdown_generator: {
        type: "DefaultMarkdownGenerator",
        content_filter: {
          type: "BM25ContentFilter",
          user_query: query,
          bm25_threshold: threshold,
        },
      },
    };

    const browserConfig: BrowserConfig = {
      headless: true,
      verbose: false,
    };

    const response = await this.crawl([url], crawlerConfig, browserConfig);

    if (!response.results || response.results.length === 0) {
      throw new Error("No results returned from crawl");
    }

    const result = response.results[0];
    if (!result.success) {
      throw new Error(result.error_message || "Crawl failed");
    }

    return result;
  }

  /**
   * Health check
   */
  async health(): Promise<{
    status: string;
    timestamp: number;
    version: string;
  }> {
    return this.request("/health");
  }

  /**
   * Convert webpage to markdown and return as a File object for RagFlow upload
   *
   * @param url - The URL to convert
   * @param options - Configuration options
   */
  async getMarkdownAsFile(
    url: string,
    options: GetMarkdownOptions = {}
  ): Promise<{
    file: File;
    title: string;
    markdown: string;
    rawMarkdown: string;
  }> {
    const {
      filename,
      filterType = "pruning",
      pruningThreshold = 0.48,
      bm25Query,
      bm25Threshold = 1.0,
      useCache = true,
      useMdEndpoint = true, // Default to /md endpoint for simplicity
    } = options;

    let markdown: string;
    let rawMarkdown: string;
    let pageTitle: string | undefined;

    if (useMdEndpoint) {
      // Use the simpler /md endpoint
      const mdFilter: MdFilterType =
        filterType === "bm25" ? "bm25" : filterType === "none" ? "raw" : "fit";
      const response = await this.getMarkdown(
        url,
        mdFilter,
        bm25Query,
        useCache
      );

      if (!response.success || !response.markdown) {
        throw new Error("Failed to convert webpage to markdown");
      }

      markdown = response.markdown;
      rawMarkdown = response.markdown; // /md endpoint returns the filtered version directly
    } else {
      // Use /crawl endpoint with full config
      let result: CrawlResult;
      if (filterType === "bm25" && bm25Query) {
        result = await this.crawlWithBM25(
          url,
          bm25Query,
          bm25Threshold,
          useCache
        );
      } else if (filterType === "pruning") {
        result = await this.crawlWithPruning(url, pruningThreshold, useCache);
      } else {
        // No filter - just crawl with default config
        const response = await this.crawl([url], { cache_mode: "enabled" });
        if (!response.results || response.results.length === 0) {
          throw new Error("No results returned from crawl");
        }
        result = response.results[0];
        if (!result.success) {
          throw new Error(result.error_message || "Crawl failed");
        }
      }

      if (!result.markdown) {
        throw new Error("No markdown content returned from crawl");
      }

      // Use fit_markdown if available (filtered), otherwise raw_markdown
      markdown =
        result.markdown.fit_markdown || result.markdown.raw_markdown;
      rawMarkdown = result.markdown.raw_markdown;
      pageTitle = result.metadata?.title;
    }

    if (!markdown) {
      throw new Error("Failed to convert webpage to markdown");
    }

    // Generate filename from URL if not provided
    const urlObj = new URL(url);
    const sanitizedName =
      filename ||
      `${urlObj.hostname}${urlObj.pathname}`
        .replace(/[^a-zA-Z0-9]/g, "_")
        .replace(/_+/g, "_")
        .substring(0, 100);

    const finalFilename = `${sanitizedName}.md`;

    // Create a File object from the markdown content
    const blob = new Blob([markdown], { type: "text/markdown" });
    const file = new File([blob], finalFilename, { type: "text/markdown" });

    // Extract title from metadata, markdown heading, or use hostname
    let title = pageTitle;
    if (!title) {
      const titleMatch = markdown.match(/^#\s+(.+)$/m);
      title = titleMatch?.[1] || urlObj.hostname;
    }

    return {
      file,
      title,
      markdown,
      rawMarkdown,
    };
  }
}

// Export singleton instance
export const crawl4aiClient = new Crawl4AIClient();

// Export class for custom instances
export { Crawl4AIClient };
export type {
  CrawlResult,
  CrawlRequest,
  CrawlResponse,
  CrawlerRunConfig,
  BrowserConfig,
  MarkdownResult,
  MarkdownResponse,
  GetMarkdownOptions,
  ContentFilter,
  PruningContentFilter,
  BM25ContentFilter,
};
