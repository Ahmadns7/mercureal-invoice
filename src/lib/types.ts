export const PAYMENT_METHODS = ["bank_transfer", "pos", "cash", "mobile_money"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const EXPENSE_CATEGORIES = [
  "Data & airtime",
  "Transport",
  "Software & subscriptions",
  "Equipment",
  "Office",
  "Marketing",
  "Bank charges",
  "Other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface Client {
  id: string;
  name: string;
  email: string;
  address: string;
}

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPriceKobo: number;
}

export interface Invoice {
  id: string;
  number: string;
  clientId: string;
  issueDate: string;
  dueDate: string;
  items: LineItem[];
  withVat: boolean;
  status: "paid" | "unpaid";
  paidDate?: string;
  paymentMethod?: PaymentMethod;
  notes: string;
}

export interface Expense {
  id: string;
  date: string;
  description: string;
  category: ExpenseCategory;
  amountKobo: number;
  /** Recurring entries count in every month from their start date onward. */
  recurring?: boolean;
}

/** Income that is not an invoice payment (retainers, grants, etc.). */
export interface OtherIncome {
  id: string;
  date: string;
  description: string;
  amountKobo: number;
  recurring?: boolean;
}

/** Monthly cap per expense category, in kobo. Missing or 0 means no cap. */
export type Budgets = Partial<Record<ExpenseCategory, number>>;

export interface AppData {
  version: 1;
  clients: Client[];
  invoices: Invoice[];
  expenses: Expense[];
  incomes: OtherIncome[];
  budgets: Budgets;
}
