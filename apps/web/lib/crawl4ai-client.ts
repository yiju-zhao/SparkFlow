/**
 * Crawl4AI Client
 *
 * Converts webpages to markdown using self-hosted Crawl4AI server.
 * Uses the /crawl endpoint with PruningContentFilter for clean, LLM-ready markdown.
 */

const CRAWL4AI_BASE_URL = process.env.CRAWL4AI_BASE_URL || "http://localhost:11235";
const CRAWL4AI_API_KEY = process.env.CRAWL4AI_API_KEY || "";

// Content filter types
export type ContentFilterType = "pruning" | "bm25" | "none";

// Pruning content filter configuration
interface PruningContentFilter {
  type: "PruningContentFilter";
  threshold?: number; // Default: 0.48
  threshold_type?: "fixed" | "dynamic"; // Default: "fixed"
  min_word_threshold?: number; // Default: 0
}

// BM25 content filter configuration (for query-based filtering)
interface BM25ContentFilter {
  type: "BM25ContentFilter";
  user_query: string;
  bm25_threshold?: number; // Default: 1.0
}

type ContentFilter = PruningContentFilter | BM25ContentFilter;

// Markdown generator configuration
interface MarkdownGenerator {
  type: "DefaultMarkdownGenerator";
  content_filter?: ContentFilter;
}

// Browser configuration
interface BrowserConfig {
  headless?: boolean;
  verbose?: boolean;
  extra_args?: string[];
}

// Crawler run configuration
interface CrawlerRunConfig {
  cache_mode?: "ENABLED" | "DISABLED" | "BYPASS";
  markdown_generator?: MarkdownGenerator;
  wait_until?: "load" | "domcontentloaded" | "networkidle0" | "networkidle2";
  page_timeout?: number;
  verbose?: boolean;
}

// Crawl request body
interface CrawlRequest {
  urls: string[];
  crawler_config?: CrawlerRunConfig;
  browser_config?: BrowserConfig;
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
   * Crawl a URL with content filtering and get markdown
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
      cache_mode: useCache ? "ENABLED" : "DISABLED",
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
      cache_mode: useCache ? "ENABLED" : "DISABLED",
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
  async health(): Promise<{ status: string; timestamp: number; version: string }> {
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
  ): Promise<{ file: File; title: string; markdown: string; rawMarkdown: string }> {
    const {
      filename,
      filterType = "pruning",
      pruningThreshold = 0.45,
      bm25Query,
      bm25Threshold = 1.0,
      useCache = true,
    } = options;

    // Crawl with appropriate filter
    let result: CrawlResult;
    if (filterType === "bm25" && bm25Query) {
      result = await this.crawlWithBM25(url, bm25Query, bm25Threshold, useCache);
    } else {
      result = await this.crawlWithPruning(url, pruningThreshold, useCache);
    }

    if (!result.markdown) {
      throw new Error("No markdown content returned from crawl");
    }

    // Use fit_markdown if available (filtered), otherwise raw_markdown
    const markdown = result.markdown.fit_markdown || result.markdown.raw_markdown;
    const rawMarkdown = result.markdown.raw_markdown;

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
    let title = result.metadata?.title;
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
  GetMarkdownOptions,
  ContentFilter,
  PruningContentFilter,
  BM25ContentFilter,
};
