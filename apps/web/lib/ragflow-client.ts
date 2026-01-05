/**
 * RagFlow API Client
 *
 * Provides methods for interacting with RagFlow's REST API for:
 * - Dataset (knowledge base) management
 * - Document upload and processing
 *
 * Note: Chat/retrieval is handled by the MCP server via the FastAPI agent.
 */

const RAGFLOW_BASE_URL = process.env.RAGFLOW_BASE_URL || "http://localhost:9380";
const RAGFLOW_API_KEY = process.env.RAGFLOW_API_KEY || "";

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
  created_at?: string;
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
        embedding_model: "BAAI/bge-large-en-v1.5", // Default embedding model
        chunk_method: "naive", // Simple chunking
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
    await this.request(`/v1/datasets/${datasetId}`, {
      method: "DELETE",
    });
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
    filename: string
  ): Promise<Document> {
    const formData = new FormData();
    formData.append("file", file, filename);

    const response = await this.request<Document[]>(
      `/v1/datasets/${datasetId}/documents`,
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
  async listDocuments(datasetId: string): Promise<Document[]> {
    const response = await this.request<Document[]>(
      `/v1/datasets/${datasetId}/documents`
    );
    return response.data || [];
  }

  /**
   * Get document status
   */
  async getDocumentStatus(
    datasetId: string,
    documentId: string
  ): Promise<Document | null> {
    try {
      const documents = await this.listDocuments(datasetId);
      return documents.find((d) => d.id === documentId) || null;
    } catch {
      return null;
    }
  }

  /**
   * Delete a document from a dataset
   */
  async deleteDocument(datasetId: string, documentId: string): Promise<void> {
    await this.request(`/v1/datasets/${datasetId}/documents/${documentId}`, {
      method: "DELETE",
    });
  }

  /**
   * Parse/process documents (trigger chunking and indexing)
   */
  async parseDocuments(datasetId: string, documentIds: string[]): Promise<void> {
    await this.request(`/v1/datasets/${datasetId}/documents/parse`, {
      method: "POST",
      body: JSON.stringify({ document_ids: documentIds }),
    });
  }

  /**
   * Stop parsing documents
   */
  async stopParsing(datasetId: string, documentIds: string[]): Promise<void> {
    await this.request(`/v1/datasets/${datasetId}/documents/parse/stop`, {
      method: "POST",
      body: JSON.stringify({ document_ids: documentIds }),
    });
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
export type { Dataset, Document, RagFlowResponse };
