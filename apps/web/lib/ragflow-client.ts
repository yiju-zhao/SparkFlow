/**
 * RagFlow API Client
 *
 * Provides methods for interacting with RagFlow's REST API for:
 * - Dataset (knowledge base) management
 * - Document upload and processing
 *
 * Note: Chat/retrieval is handled by the LangGraph server.
 */

const RAGFLOW_BASE_URL = process.env.RAGFLOW_BASE_URL || "http://localhost:9380";
const RAGFLOW_API_KEY = process.env.RAGFLOW_API_KEY || "";
const RAGFLOW_EMBEDDING_MODEL =
  process.env.RAGFLOW_EMBEDDING_MODEL || "BAAI/bge-large-en-v1.5@BAAI";
const RAGFLOW_CHUNK_SIZE = parseInt(process.env.RAGFLOW_CHUNK_SIZE || "1024", 10);
const RAGFLOW_AUTO_KEYWORDS = parseInt(process.env.RAGFLOW_AUTO_KEYWORDS || "0", 10);
const RAGFLOW_AUTO_QUESTIONS = parseInt(process.env.RAGFLOW_AUTO_QUESTIONS || "0", 10);

interface RagFlowResponse<T = unknown> {
  code: number;
  message?: string;
  data?: T;
}

interface Dataset {
  id: string;
  name: string;
  description?: string;
  document_count?: number;
  chunk_count?: number;
  created_at?: string;
}

interface Document {
  id: string;
  name: string;
  size?: number;
  type?: string;
  status?: string;
  progress?: number;
  run?: string;
  progress_msg?: string[] | string;
  created_at?: string;
}

interface Chunk {
  id: string;
  content: string;
  document_id?: string;
  docnm_kwd?: string;      // Document name keyword
  available?: boolean;
  positions?: unknown[];   // Layout positions from RagFlow (not character offsets)
  important_keywords?: string;
  image_id?: string;
}

class RagFlowClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl?: string, apiKey?: string) {
    this.baseUrl = baseUrl || RAGFLOW_BASE_URL;
    this.apiKey = apiKey || RAGFLOW_API_KEY;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<RagFlowResponse<T>> {
    const url = `${this.baseUrl}/api${endpoint}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      ...((options.headers as Record<string, string>) || {}),
    };

    // Don't set Content-Type for FormData (let browser set it with boundary)
    if (!(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`RagFlow API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  // ============================================
  // Dataset (Knowledge Base) Operations
  // ============================================

  /**
   * Create a new dataset (knowledge base)
   */
  async createDataset(name: string, description?: string): Promise<Dataset> {
    const response = await this.request<Dataset>("/v1/datasets", {
      method: "POST",
      body: JSON.stringify({
        name,
        description,
        embedding_model: RAGFLOW_EMBEDDING_MODEL,
        chunk_method: "naive",
        parser_config: {
          chunk_token_num: RAGFLOW_CHUNK_SIZE,
          delimiter: "#\n",
          auto_keywords: RAGFLOW_AUTO_KEYWORDS,
          auto_questions: RAGFLOW_AUTO_QUESTIONS,
        },
      }),
    });

    if (response.code !== 0 || !response.data) {
      throw new Error(response.message || "Failed to create dataset");
    }

    return response.data;
  }

  /**
   * Get a dataset by ID
   */
  async getDataset(datasetId: string): Promise<Dataset | null> {
    try {
      const response = await this.request<Dataset>(`/v1/datasets/${datasetId}`);
      return response.data || null;
    } catch {
      return null;
    }
  }

  /**
   * List all datasets
   */
  async listDatasets(): Promise<Dataset[]> {
    const response = await this.request<Dataset[]>("/v1/datasets");
    return response.data || [];
  }

  /**
   * Delete a dataset
   */
  async deleteDataset(datasetId: string): Promise<void> {
    const response = await this.request(`/v1/datasets`, {
      method: "DELETE",
      body: JSON.stringify({ ids: [datasetId] }),
    });

    if (response.code !== 0) {
      throw new Error(response.message || "Failed to delete dataset");
    }
  }

  // ============================================
  // Document Operations
  // ============================================

  /**
   * Upload a document to a dataset
   */
  async uploadDocument(
    datasetId: string,
    file: File,
    filename: string,
    options: { autoParse?: boolean } = {}
  ): Promise<Document> {
    const formData = new FormData();
    formData.append("file", file, filename);

    const searchParams = new URLSearchParams();
    if (options.autoParse) {
      searchParams.set("auto_parse", "true");
    }
    const query = searchParams.toString();
    const endpoint = `/v1/datasets/${datasetId}/documents${query ? `?${query}` : ""}`;

    const response = await this.request<Document[]>(
      endpoint,
      {
        method: "POST",
        body: formData,
      }
    );

    if (response.code !== 0 || !response.data?.[0]) {
      throw new Error(response.message || "Failed to upload document");
    }

    return response.data[0];
  }

  /**
   * List documents in a dataset
   */
  async listDocuments(
    datasetId: string,
    params: {
      id?: string;
      page?: number;
      pageSize?: number;
      run?: string[];
    } = {}
  ): Promise<Document[]> {
    const searchParams = new URLSearchParams();
    if (params.id) searchParams.set("id", params.id);
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.pageSize) searchParams.set("page_size", params.pageSize.toString());
    if (params.run?.length) searchParams.set("run", params.run.join(","));

    const query = searchParams.toString();
    const endpoint = `/v1/datasets/${datasetId}/documents${query ? `?${query}` : ""}`;

    const response = await this.request<
      Document[] | { docs?: Document[]; total_datasets?: number }
    >(endpoint);

    // The API may return either a flat array or a wrapped { docs } structure
    const data = response.data;
    if (Array.isArray(data)) {
      return data;
    }

    if (data?.docs && Array.isArray(data.docs)) {
      return data.docs;
    }

    return [];
  }

  /**
   * Get document status
   */
  async getDocumentStatus(
    datasetId: string,
    documentId: string
  ): Promise<Document | null> {
    try {
      const documents = await this.listDocuments(datasetId, {
        id: documentId,
        page: 1,
        pageSize: 10,
      });
      return documents.find((d) => d.id === documentId) || null;
    } catch {
      return null;
    }
  }

  /**
   * Delete a document from a dataset
   */
  async deleteDocument(datasetId: string, documentId: string): Promise<void> {
    // Newer API uses bulk delete
    await this.request(`/v1/datasets/${datasetId}/documents`, {
      method: "DELETE",
      body: JSON.stringify({ ids: [documentId] }),
    });
  }

  /**
   * Parse/process documents (trigger chunking and indexing)
   */
  async parseDocuments(datasetId: string, documentIds: string[]): Promise<void> {
    await this.request(`/v1/datasets/${datasetId}/chunks`, {
      method: "POST",
      body: JSON.stringify({ document_ids: documentIds }),
    });
  }

  /**
   * Stop parsing documents
   */
  async stopParsing(datasetId: string, documentIds: string[]): Promise<void> {
    await this.request(`/v1/datasets/${datasetId}/chunks/stop`, {
      method: "POST",
      body: JSON.stringify({ document_ids: documentIds }),
    });
  }

  // ============================================
  // Webpage Operations (if supported)
  // ============================================

  // ============================================
  // Chunk Operations
  // ============================================

  /**
   * List all chunks for a document
   * Returns chunks ordered by their position in the document
   */
  async listChunks(
    datasetId: string,
    documentId: string,
    params: { page?: number; pageSize?: number; keywords?: string } = {}
  ): Promise<{ chunks: Chunk[]; total: number }> {
    const searchParams = new URLSearchParams();
    searchParams.set("page", (params.page || 1).toString());
    searchParams.set("page_size", (params.pageSize || 1024).toString());
    if (params.keywords) searchParams.set("keywords", params.keywords);

    const endpoint = `/v1/datasets/${datasetId}/documents/${documentId}/chunks?${searchParams.toString()}`;

    try {
      const response = await this.request<{
        chunks?: Chunk[];
        total?: number;
        doc?: Document;
      }>(endpoint);

      const data = response.data;
      return {
        chunks: data?.chunks || [],
        total: data?.total || 0,
      };
    } catch (error) {
      console.error("Error listing chunks:", error);
      return { chunks: [], total: 0 };
    }
  }

  /**
   * Get a specific chunk's content by ID
   * Searches all documents in the dataset for the chunk
   */
  async getChunk(
    datasetId: string,
    chunkId: string
  ): Promise<{ content: string; documentId: string; documentName: string } | null> {
    try {
      // List all documents in the dataset
      const documents = await this.listDocuments(datasetId, { pageSize: 100 });

      // Search each document for the chunk
      for (const doc of documents) {
        const endpoint = `/v1/datasets/${datasetId}/documents/${doc.id}/chunks?id=${chunkId}&page=1&page_size=1`;
        const response = await this.request<
          { id: string; content: string }[] | { chunks?: { id: string; content: string }[] }
        >(endpoint);

        const data = response.data;
        let chunks: { id: string; content: string }[] = [];

        if (Array.isArray(data)) {
          chunks = data;
        } else if (data?.chunks && Array.isArray(data.chunks)) {
          chunks = data.chunks;
        }

        const chunk = chunks.find((c) => c.id === chunkId);
        if (chunk) {
          return {
            content: chunk.content,
            documentId: doc.id,
            documentName: doc.name,
          };
        }
      }

      return null;
    } catch (error) {
      console.error("Error getting chunk:", error);
      return null;
    }
  }

  // ============================================
  // Webpage Operations (if supported)
  // ============================================

  /**
   * Add a webpage as a document (URL-based ingestion)
   * Note: This may not be available in all RagFlow versions
   */
  async addWebpage(
    datasetId: string,
    url: string,
    name?: string
  ): Promise<Document | null> {
    try {
      const response = await this.request<Document>(
        `/v1/datasets/${datasetId}/documents/web`,
        {
          method: "POST",
          body: JSON.stringify({
            url,
            name: name || new URL(url).hostname,
          }),
        }
      );

      return response.data || null;
    } catch (error) {
      // Webpage ingestion might not be supported
      console.warn("Webpage ingestion not available:", error);
      return null;
    }
  }
}

// Export singleton instance
export const ragflowClient = new RagFlowClient();

// Export class for custom instances
export { RagFlowClient };
export type { Dataset, Document, Chunk, RagFlowResponse };
