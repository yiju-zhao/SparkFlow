export type SourceSearchType = "web" | "publication" | "wechat";

export interface SearchRequest {
  query: string;
  sourceType: SourceSearchType;
  domains?: string[]; // only for sourceType "web"
}

export interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  meta: string;
  url?: string;
  sourceType: SourceSearchType;
}

export interface SearchStatusResponse {
  status: "searching" | "completed" | "failed";
  results: SearchResult[];
  error?: string;
}
