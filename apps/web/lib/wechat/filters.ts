import { z } from "zod";

export const WECHAT_PAGE_SIZE = 24;

export const wechatArticleFiltersSchema = z.object({
  source: z.coerce.number().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().default(0),
});

export type WechatArticleFilters = z.infer<typeof wechatArticleFiltersSchema>;

export function parseWechatArticleFilters(
  searchParams: Record<string, string | string[] | undefined>,
): WechatArticleFilters {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") params[key] = value;
    else if (Array.isArray(value) && value.length > 0) params[key] = value[0];
  }
  return wechatArticleFiltersSchema.parse(params);
}
