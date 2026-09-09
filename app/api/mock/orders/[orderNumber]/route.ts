import { NextRequest, NextResponse } from "next/server";
import { getMockOrder } from "@/lib/mock/orders";

/** POC stand-in for an order system; called by the bot's get_order tool. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  const order = getMockOrder(orderNumber);
  if (!order) {
    return NextResponse.json({ found: false, orderNumber, message: "No order with that number. Ask the customer to double-check it." }, { status: 404 });
  }
  return NextResponse.json({
    found: true,
    ...order,
    items: order.items.map((i) => ({ ...i, withinReturnWindow: order.daysSinceDelivery <= i.returnWindowDays })),
  });
}
