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
}

export interface AppData {
  version: 1;
  clients: Client[];
  invoices: Invoice[];
  expenses: Expense[];
}
