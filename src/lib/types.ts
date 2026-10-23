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

/** Invoice currencies. Expenses and other income are always naira. */
export const CURRENCIES = ["NGN", "USD", "GBP", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Naira per 1 major unit (dollar, pound, euro) of each foreign currency. NGN is always 1. */
export type FxRates = Partial<Record<Exclude<Currency, "NGN">, number>>;

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
  /** Minor units of the invoice currency (kobo for NGN, cents for USD). */
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
  /** Missing means NGN. */
  currency?: Currency;
  /** Optional Paystack or Flutterwave payment link (https). */
  paymentLink?: string;
  /** Marks a monthly template that "generate this month" clones. */
  monthlyTemplate?: boolean;
  /** Id of the template this invoice was generated from. */
  generatedFrom?: string;
}

export interface Expense {
  id: string;
  date: string;
  description: string;
  category: ExpenseCategory;
  amountKobo: number;
  /** Recurring entries count in every month from their start date onward. */
  recurring?: boolean;
  /** Small receipt photo (data URL), kept only when it fits the storage budget. */
  receiptImage?: string;
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

/** Narration keyword that maps to a category. */
export interface ImportRule {
  keyword: string;
  category: ExpenseCategory;
}

/** Learned categories for one bank's statement exports. */
export interface ImportMapping {
  bank: string;
  rules: ImportRule[];
}

export interface AppData {
  version: 1;
  clients: Client[];
  invoices: Invoice[];
  expenses: Expense[];
  incomes: OtherIncome[];
  budgets: Budgets;
  fxRates?: FxRates;
  importMappings?: ImportMapping[];
}
