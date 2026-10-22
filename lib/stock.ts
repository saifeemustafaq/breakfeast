import { INGREDIENTS } from "./recipes";
import type { StockEntry } from "./types";
import { DAY } from "./time";

/** Whether we remember having this item. Cooked batches expire after their keep time. */
export function rememberedInStock(id: string, stock: Record<string, StockEntry>, now: number) {
  const entry = stock[id];
  if (!entry?.inStock) return false;
  const batch = INGREDIENTS[id]?.batch;
  if (batch && now - Date.parse(entry.updatedAt) > batch.keepsDays * DAY) return false;
  return true;
}
