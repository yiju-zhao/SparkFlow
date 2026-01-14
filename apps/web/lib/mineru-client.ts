/**
 * MineRU API Client
 *
 * Parses PDF documents to extract markdown content using the MineRU API.
 * Used for document ingestion workflow.
 */

const MINERU_BASE_URL = process.env.MINERU_BASE_URL || "http://localhost:8000";

interface MineRUParseResponse {
    results: {
        [key: string]: {
            md_content: string;
            images?: Record<string, string>;
        };
    };
    version?: string;
    backend?: string;
}

interface ParseResult {
    markdown: string;
    images: Record<string, string>;
    metadata: {
        version?: string;
        backend?: string;
    };
}

class MineRUClient {
    private baseUrl: string;

    constructor(baseUrl?: string) {
        this.baseUrl = baseUrl || MINERU_BASE_URL;
    }

    /**
     * Parse a PDF file and extract markdown content
     *
     * @param file - PDF file to parse
     * @returns Parsed markdown content and extracted images
     */
    async parseDocument(file: File): Promise<ParseResult> {
        const formData = new FormData();
        formData.append("files", file, file.name);

        // MineRU API parameters
        formData.append("output_dir", "./output");
        formData.append("lang_list", JSON.stringify(["ch_server", "en"]));
        formData.append("backend", "pipeline");
        formData.append("parse_method", "auto");
        formData.append("formula_enable", "true");
        formData.append("table_enable", "true");
        formData.append("return_md", "true");
        formData.append("return_middle_json", "false");
        formData.append("return_model_output", "false");
        formData.append("return_content_list", "false");
        formData.append("return_images", "false"); // Skip images for now to reduce response size
        formData.append("response_format_zip", "false");
        formData.append("start_page_id", "0");
        formData.append("end_page_id", "99999");

        const response = await fetch(`${this.baseUrl}/file_parse`, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `MineRU API error: ${response.status} ${response.statusText} - ${errorText}`
            );
        }

        const data: MineRUParseResponse = await response.json();

        if (!data.results) {
            throw new Error("No results returned from MineRU API");
        }

        // Get first document result
        const docKey = Object.keys(data.results)[0];
        if (!docKey) {
            throw new Error("Empty results from MineRU API");
        }

        const docResult = data.results[docKey];
        const markdown = docResult.md_content || "";

        if (!markdown) {
            throw new Error("No markdown content extracted from document");
        }

        return {
            markdown,
            images: docResult.images || {},
            metadata: {
                version: data.version,
                backend: data.backend,
            },
        };
    }

    /**
     * Health check for MineRU API
     */
    async health(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/docs`, {
                method: "GET",
            });
            return response.ok;
        } catch {
            return false;
        }
    }
}

// Export singleton instance
export const mineruClient = new MineRUClient();

// Export class for custom instances
export { MineRUClient };
export type { ParseResult, MineRUParseResponse };
