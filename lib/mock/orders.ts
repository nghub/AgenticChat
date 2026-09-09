/**
 * Stand-in order system for the POC. Two toothbrush orders, one inside and
 * one outside the 30-day window, plus a handpiece order inside the general
 * window but outside its SKU-specific 14-day one. Dates are relative to now
 * so the scenarios stay valid. The return decision is made HERE, in code,
 * from the SKU's rule - the model only relays it (guardrails doc §2.1/§2.2).
 */
export interface MockOrderItem {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  returnWindowDays: number;
  returnRule: string;
}
export interface MockOrder {
  orderNumber: string;
  customerName: string;
  status: "Delivered";
  deliveredAt: string; // ISO date
  daysSinceDelivery: number;
  items: MockOrderItem[];
}

const TOOTHBRUSH: Omit<MockOrderItem, "quantity"> = {
  sku: "DEN-051",
  name: "Soft-Bristle Adult Toothbrush",
  unitPrice: 18.95,
  returnWindowDays: 30,
  returnRule: "30 days from delivery. Unopened packs may be returned for a refund; a faulty toothbrush is handled as a defect claim within the same 30 days.",
};
const HANDPIECE: Omit<MockOrderItem, "quantity"> = {
  sku: "DEN-043",
  name: "High-Speed Air Handpiece",
  unitPrice: 399,
  returnWindowDays: 14,
  returnRule: "Return within 14 days, unused and in original packaging. 12-month manufacturer warranty for defects.",
};

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const SEED: Array<{ orderNumber: string; customerName: string; deliveredDaysAgo: number; items: Array<Omit<MockOrderItem, "quantity"> & { quantity: number }> }> = [
  { orderNumber: "ORD-1001", customerName: "Dr. Priya Patel", deliveredDaysAgo: 12, items: [{ ...TOOTHBRUSH, quantity: 2 }] },
  { orderNumber: "ORD-1002", customerName: "Dr. Daniel Kim", deliveredDaysAgo: 47, items: [{ ...TOOTHBRUSH, quantity: 1 }] },
  { orderNumber: "ORD-1003", customerName: "Riverside Dental", deliveredDaysAgo: 20, items: [{ ...HANDPIECE, quantity: 1 }] },
];

export function getMockOrder(orderNumber: string): MockOrder | null {
  const key = orderNumber.trim().toUpperCase().replace(/\s+/g, "");
  const seed = SEED.find((o) => o.orderNumber === key);
  if (!seed) return null;
  return {
    orderNumber: seed.orderNumber,
    customerName: seed.customerName,
    status: "Delivered",
    deliveredAt: daysAgo(seed.deliveredDaysAgo),
    daysSinceDelivery: seed.deliveredDaysAgo,
    items: seed.items,
  };
}

export type ReturnReason = "defective" | "changed_mind" | "wrong_item" | "damaged_in_transit";

export interface ReturnDecision {
  accepted: boolean;
  orderNumber: string;
  sku: string;
  reason: ReturnReason;
  daysSinceDelivery: number;
  returnWindowDays: number;
  rmaNumber?: string;
  instructions?: string;
  declineReason?: "outside_return_window" | "unknown_order" | "sku_not_on_order";
  nextStep?: string;
}

const issued = new Map<string, string>();

export function decideReturn(orderNumber: string, sku: string, reason: ReturnReason): ReturnDecision {
  const order = getMockOrder(orderNumber);
  const base = { orderNumber: orderNumber.toUpperCase(), sku: sku.toUpperCase(), reason };
  if (!order) return { ...base, accepted: false, daysSinceDelivery: 0, returnWindowDays: 0, declineReason: "unknown_order", nextStep: "Ask the customer to confirm the order number." };
  const item = order.items.find((i) => i.sku === sku.toUpperCase());
  if (!item) return { ...base, accepted: false, daysSinceDelivery: order.daysSinceDelivery, returnWindowDays: 0, declineReason: "sku_not_on_order", nextStep: "Confirm which item on the order the customer means." };
  const within = order.daysSinceDelivery <= item.returnWindowDays;
  if (!within) {
    return {
      ...base, accepted: false, daysSinceDelivery: order.daysSinceDelivery, returnWindowDays: item.returnWindowDays,
      declineReason: "outside_return_window",
      nextStep: reason === "defective"
        ? "Outside the return window; a defect may still qualify for warranty support - offer to open a warranty case with customer support."
        : "Outside the return window; offer to send the case to customer support for human review, without promising an exception.",
    };
  }
  const key = `${order.orderNumber}:${item.sku}`;
  const rmaNumber = issued.get(key) || `RMA-${order.orderNumber.replace("ORD-", "")}-${Math.floor(1000 + Math.random() * 9000)}`;
  issued.set(key, rmaNumber);
  return {
    ...base, accepted: true, daysSinceDelivery: order.daysSinceDelivery, returnWindowDays: item.returnWindowDays, rmaNumber,
    instructions: "A prepaid return label has been emailed. Pack the item in its original packaging with the RMA number visible; the refund is processed within 3-5 business days of the seller receiving it.",
  };
}
