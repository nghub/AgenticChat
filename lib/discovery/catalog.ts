/**
 * Structured audio-electronics catalog for the Discovery POC (PRD OQ-1:
 * consumer electronics / audio). 24 SKUs with the attributes a rubric ranker
 * scores against: price, availability, use-case fit, room size, connectivity,
 * active noise cancelling, battery, and water resistance. Deliberately
 * includes water-*resistant* items (Probe #6: must not be upgraded to
 * "waterproof") and out-of-stock items (Probe #5: never recommended).
 *
 * This is the single source of truth: the ranker scores against it, and a
 * prose rendering of it is ingested as the Discovery bot's knowledge for
 * factual Q&A.
 */
export type AudioCategory = "over_ear_headphones" | "earbuds" | "soundbar" | "bluetooth_speaker" | "bookshelf_speaker";

export interface AudioProduct {
  sku: string;
  name: string;
  brand: string;
  category: AudioCategory;
  price: number;
  stock: number;
  // Rubric-scored attributes:
  useCases: string[];          // "commute", "office", "gym", "home_theater", "small_room", "large_room", "gaming", "calls", "audiophile"
  roomSize: "n/a" | "small" | "medium" | "large";
  connectivity: string[];      // "bluetooth", "wifi", "hdmi_arc", "optical", "aux_3.5mm", "usb_c"
  noiseCancelling: boolean;
  batteryHours: number | null; // null = wired / powered
  waterResistance: string | null; // e.g. "IPX4" - water-resistant, never "waterproof"
  wireless: boolean;
  blurb: string;
}

export const AUDIO_CATALOG: AudioProduct[] = [
  { sku: "AUD-101", name: "Aria Quiet 700", brand: "Aria", category: "over_ear_headphones", price: 279, stock: 14, useCases: ["commute", "office", "calls", "audiophile"], roomSize: "n/a", connectivity: ["bluetooth", "aux_3.5mm", "usb_c"], noiseCancelling: true, batteryHours: 30, waterResistance: null, wireless: true, blurb: "Flagship over-ear with best-in-class active noise cancelling and a 30-hour battery, tuned for travel and open offices." },
  { sku: "AUD-102", name: "Aria Studio 400", brand: "Aria", category: "over_ear_headphones", price: 179, stock: 9, useCases: ["office", "audiophile", "calls"], roomSize: "n/a", connectivity: ["bluetooth", "aux_3.5mm"], noiseCancelling: true, batteryHours: 24, waterResistance: null, wireless: true, blurb: "Balanced over-ear with solid ANC and a neutral sound signature for focused listening." },
  { sku: "AUD-103", name: "Nomad Trek ANC", brand: "Nomad", category: "over_ear_headphones", price: 129, stock: 0, useCases: ["commute", "office"], roomSize: "n/a", connectivity: ["bluetooth", "aux_3.5mm"], noiseCancelling: true, batteryHours: 40, waterResistance: null, wireless: true, blurb: "Value ANC headphone with a huge 40-hour battery." },
  { sku: "AUD-104", name: "Sonare Reference One", brand: "Sonare", category: "over_ear_headphones", price: 449, stock: 5, useCases: ["audiophile", "office"], roomSize: "n/a", connectivity: ["aux_3.5mm", "usb_c"], noiseCancelling: false, batteryHours: null, waterResistance: null, wireless: false, blurb: "Open-back wired reference headphone for critical listening; no ANC, no wireless." },
  { sku: "AUD-105", name: "Pulse Play 200", brand: "Pulse", category: "over_ear_headphones", price: 99, stock: 22, useCases: ["office", "gaming", "calls"], roomSize: "n/a", connectivity: ["bluetooth", "usb_c", "aux_3.5mm"], noiseCancelling: false, batteryHours: 35, waterResistance: null, wireless: true, blurb: "Affordable all-rounder with a low-latency gaming mode and a good mic for calls." },

  { sku: "AUD-201", name: "Aria Air Pro", brand: "Aria", category: "earbuds", price: 199, stock: 31, useCases: ["commute", "gym", "calls", "office"], roomSize: "n/a", connectivity: ["bluetooth"], noiseCancelling: true, batteryHours: 6, waterResistance: "IPX4", wireless: true, blurb: "Premium earbuds with strong ANC and an IPX4 sweat-resistant build for workouts and commutes." },
  { sku: "AUD-202", name: "Nomad Buds Sport", brand: "Nomad", category: "earbuds", price: 89, stock: 40, useCases: ["gym", "commute"], roomSize: "n/a", connectivity: ["bluetooth"], noiseCancelling: false, batteryHours: 8, waterResistance: "IPX7", wireless: true, blurb: "Rugged sport earbuds with a secure fit and IPX7 water resistance for heavy sweat and rain." },
  { sku: "AUD-203", name: "Pulse Mini Buds", brand: "Pulse", category: "earbuds", price: 59, stock: 0, useCases: ["commute", "calls"], roomSize: "n/a", connectivity: ["bluetooth"], noiseCancelling: false, batteryHours: 5, waterResistance: "IPX4", wireless: true, blurb: "Compact budget earbuds for calls and casual listening." },
  { sku: "AUD-204", name: "Sonare Free ANC", brand: "Sonare", category: "earbuds", price: 249, stock: 12, useCases: ["commute", "office", "audiophile", "calls"], roomSize: "n/a", connectivity: ["bluetooth"], noiseCancelling: true, batteryHours: 7, waterResistance: "IPX4", wireless: true, blurb: "Audiophile-leaning earbuds with adaptive ANC and hi-res codec support." },

  { sku: "AUD-301", name: "Aria Cinebar 300", brand: "Aria", category: "soundbar", price: 299, stock: 8, useCases: ["home_theater", "small_room", "medium_room"], roomSize: "small", connectivity: ["hdmi_arc", "optical", "bluetooth"], noiseCancelling: false, batteryHours: null, waterResistance: null, wireless: false, blurb: "Compact 2.1 soundbar with a slim wireless subwoofer, sized for small and medium rooms; big dialogue clarity without dominating the space." },
  { sku: "AUD-302", name: "Nomad Bar Lite", brand: "Nomad", category: "soundbar", price: 149, stock: 17, useCases: ["small_room", "home_theater"], roomSize: "small", connectivity: ["hdmi_arc", "optical", "aux_3.5mm"], noiseCancelling: false, batteryHours: null, waterResistance: null, wireless: false, blurb: "Single-unit compact soundbar, no subwoofer - a tidy upgrade over TV speakers in a small room or apartment." },
  { sku: "AUD-303", name: "Sonare Theater 900", brand: "Sonare", category: "soundbar", price: 799, stock: 4, useCases: ["home_theater", "large_room"], roomSize: "large", connectivity: ["hdmi_arc", "optical", "wifi"], noiseCancelling: false, batteryHours: null, waterResistance: null, wireless: false, blurb: "5.1.2 Dolby Atmos bar with up-firing drivers and a large subwoofer for big living rooms and dedicated theaters." },
  { sku: "AUD-304", name: "Pulse Sound 250", brand: "Pulse", category: "soundbar", price: 199, stock: 0, useCases: ["small_room", "medium_room", "home_theater"], roomSize: "medium", connectivity: ["hdmi_arc", "bluetooth"], noiseCancelling: false, batteryHours: null, waterResistance: null, wireless: false, blurb: "Mid-size 2.0 soundbar for medium rooms." },
  { sku: "AUD-305", name: "Aria Cinebar 500", brand: "Aria", category: "soundbar", price: 499, stock: 6, useCases: ["home_theater", "medium_room", "large_room"], roomSize: "large", connectivity: ["hdmi_arc", "optical", "wifi", "bluetooth"], noiseCancelling: false, batteryHours: null, waterResistance: null, wireless: false, blurb: "3.1 soundbar with dedicated center channel and wireless sub for medium-to-large rooms." },

  { sku: "AUD-401", name: "Nomad Boom Go", brand: "Nomad", category: "bluetooth_speaker", price: 79, stock: 33, useCases: ["gym", "commute", "small_room"], roomSize: "small", connectivity: ["bluetooth", "aux_3.5mm"], noiseCancelling: false, batteryHours: 18, waterResistance: "IP67", wireless: true, blurb: "Portable rugged speaker with IP67 dust and water resistance and an 18-hour battery for outdoors." },
  { sku: "AUD-402", name: "Pulse Flip", brand: "Pulse", category: "bluetooth_speaker", price: 49, stock: 27, useCases: ["small_room", "commute"], roomSize: "small", connectivity: ["bluetooth"], noiseCancelling: false, batteryHours: 12, waterResistance: "IPX5", wireless: true, blurb: "Pocket speaker, IPX5 splash-resistant, great for a desk or a small room." },
  { sku: "AUD-403", name: "Aria Room 1", brand: "Aria", category: "bluetooth_speaker", price: 199, stock: 10, useCases: ["small_room", "medium_room", "audiophile"], roomSize: "medium", connectivity: ["bluetooth", "wifi", "aux_3.5mm"], noiseCancelling: false, batteryHours: null, waterResistance: null, wireless: false, blurb: "Powered wifi shelf speaker with room-filling sound for a small-to-medium room; mains-powered, not portable." },
  { sku: "AUD-404", name: "Sonare Move", brand: "Sonare", category: "bluetooth_speaker", price: 299, stock: 0, useCases: ["small_room", "medium_room", "audiophile"], roomSize: "medium", connectivity: ["bluetooth", "wifi"], noiseCancelling: false, batteryHours: 11, waterResistance: "IP56", wireless: true, blurb: "Portable-but-premium wifi/Bluetooth speaker with audiophile tuning." },

  { sku: "AUD-501", name: "Sonare Shelf S2", brand: "Sonare", category: "bookshelf_speaker", price: 349, stock: 7, useCases: ["audiophile", "small_room", "medium_room"], roomSize: "medium", connectivity: ["bluetooth", "aux_3.5mm", "optical"], noiseCancelling: false, batteryHours: null, waterResistance: null, wireless: false, blurb: "Active bookshelf pair with a warm, detailed sound for a small-to-medium listening room; built-in amp, no receiver needed." },
  { sku: "AUD-502", name: "Aria Shelf A1", brand: "Aria", category: "bookshelf_speaker", price: 229, stock: 11, useCases: ["small_room", "audiophile"], roomSize: "small", connectivity: ["bluetooth", "aux_3.5mm"], noiseCancelling: false, batteryHours: null, waterResistance: null, wireless: false, blurb: "Compact active bookshelf pair sized for a small room or desk." },
  { sku: "AUD-503", name: "Pulse Studio Monitors", brand: "Pulse", category: "bookshelf_speaker", price: 159, stock: 15, useCases: ["small_room", "audiophile", "gaming"], roomSize: "small", connectivity: ["aux_3.5mm", "usb_c", "optical"], noiseCancelling: false, batteryHours: null, waterResistance: null, wireless: false, blurb: "Budget powered studio monitors for a desk, a small room, or gaming." },
  { sku: "AUD-504", name: "Nomad Shelf Outdoor", brand: "Nomad", category: "bookshelf_speaker", price: 279, stock: 6, useCases: ["large_room", "small_room"], roomSize: "large", connectivity: ["bluetooth", "aux_3.5mm"], noiseCancelling: false, batteryHours: null, waterResistance: "IP65", wireless: false, blurb: "Weather-resistant powered speakers (IP65) for a patio or a large open room." },
  { sku: "AUD-505", name: "Sonare Shelf S4", brand: "Sonare", category: "bookshelf_speaker", price: 599, stock: 3, useCases: ["audiophile", "medium_room", "large_room"], roomSize: "large", connectivity: ["bluetooth", "aux_3.5mm", "optical", "wifi"], noiseCancelling: false, batteryHours: null, waterResistance: null, wireless: false, blurb: "Larger reference active bookshelf pair for a medium-to-large room." },
];

export function getProduct(sku: string): AudioProduct | undefined {
  return AUDIO_CATALOG.find((p) => p.sku === sku.trim().toUpperCase());
}

/** Prose rendering used as the Discovery bot's ingested knowledge (RAG). */
export function catalogAsProse(): string {
  const cap = (s: string) => s.replace(/_/g, " ");
  const lines = AUDIO_CATALOG.map((p) => {
    const water = p.waterResistance ? `${p.waterResistance} (water-resistant, not waterproof)` : "no water resistance rating";
    const battery = p.batteryHours ? `${p.batteryHours}-hour battery` : "mains-powered (no battery)";
    return [
      `${p.sku} - ${p.name} by ${p.brand} (${cap(p.category)}). Price $${p.price.toFixed(2)}. ${p.stock > 0 ? `In stock (${p.stock}).` : "Out of stock."}`,
      `Best for: ${p.useCases.map(cap).join(", ")}. Room size: ${p.roomSize}. Connectivity: ${p.connectivity.map(cap).join(", ")}.`,
      `Active noise cancelling: ${p.noiseCancelling ? "yes" : "no"}. Battery: ${battery}. Water resistance: ${water}.`,
      p.blurb,
    ].join(" ");
  });
  return `AudioHub product catalog (synthetic POC data).\n\n${lines.join("\n\n")}`;
}
