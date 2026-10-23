import { EXPENSE_CATEGORIES, type AppData } from "./types";
import { categoryTotals } from "./summary";

export interface BudgetRow {
  category: (typeof EXPENSE_CATEGORIES)[number];
  capKobo: number;
  spentKobo: number;
  /** spent / cap, can exceed 1 when over budget. */
  ratio: number;
  over: boolean;
}

/** Budget progress for one month. Only categories with a cap are returned, in category order. */
export function budgetStatus(data: AppData, month: string): BudgetRow[] {
  const spent = new Map(categoryTotals(data, [month]).map((c) => [c.category, c.kobo]));
  return EXPENSE_CATEGORIES.flatMap((category) => {
    const cap = data.budgets[category];
    if (!cap || cap <= 0) return [];
    const spentKobo = spent.get(category) ?? 0;
    return [{ category, capKobo: cap, spentKobo, ratio: spentKobo / cap, over: spentKobo > cap }];
  });
}
