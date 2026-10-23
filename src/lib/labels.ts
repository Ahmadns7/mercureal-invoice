import type { PaymentMethod } from "./types";

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: "Bank transfer",
  pos: "POS",
  cash: "Cash",
  mobile_money: "Mobile money",
};

export function paymentMethodLabel(m: PaymentMethod | undefined): string {
  return m ? PAYMENT_LABELS[m] : "";
}
