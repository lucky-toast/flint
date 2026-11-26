import type { Shop } from "../../core";
import { item, order } from "../money";
import { svgDataUrl } from "../svg";

// Sticker Barn: stickers and art prints, selling on Etsy. Every item has the options Finish and Size;
// Finish is Foil or Matte, so "foil vs non-foil" is a grouping by Finish.

const logo = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 64">
  <path d="M8 54 V26 L30 8 L52 26 V54 Z" fill="#d1495b"/>
  <rect x="22" y="34" width="16" height="20" fill="#fff4e0"/>
  <text x="64" y="42" font-family="Verdana, sans-serif" font-size="24" font-weight="bold" fill="#2a1e5c">Sticker Barn</text>
</svg>`);

const peelHere = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <path d="M8 8 h48 v32 l-16 16 h-32 Z" fill="#fff4e0" stroke="#2a1e5c" stroke-width="3"/>
  <path d="M56 40 h-16 v16" fill="#d1495b" stroke="#2a1e5c" stroke-width="3"/>
</svg>`);

export const stickerBarn: Shop = {
  id: "sticker-barn",
  name: "Sticker Barn",
  platform: "etsy",
  assets: { logo, peel_here: peelHere },
  defaultOrderId: "barn-3003",
  orders: [
    order({
      id: "barn-3001",
      label: "Typical order",
      number: "3001",
      date: "2026-11-04",
      buyer: "Casey Morgan",
      shipping: 1.5,
      shippingAddress: {
        name: "Casey Morgan",
        line1: "62 Lakeview Terrace",
        city: "Madison",
        region: "WI",
        postalCode: "53703",
        country: "United States",
      },
      lineItems: [
        item({ title: "Frog in a Hat Sticker", sku: "STK-FROG-HAT-3", quantity: 3, options: { Finish: "Matte", Size: "3 in" }, unitPrice: 4 }),
        item({ title: "Moon Phases Sticker", sku: "STK-MOON-3-F", quantity: 1, options: { Finish: "Foil", Size: "3 in" }, unitPrice: 5.5 }),
      ],
    }),
    order({
      id: "barn-3002",
      label: "Gift order",
      number: "3002",
      date: "2026-11-07",
      buyer: "Imani Brooks",
      isGift: true,
      giftMessage: "For your new laptop! Stick them everywhere. — Imani",
      shipping: 1.5,
      shippingAddress: {
        name: "Jada Brooks",
        line1: "1450 Peachtree Street NE",
        line2: "Apt 905",
        city: "Atlanta",
        region: "GA",
        postalCode: "30309",
        country: "United States",
      },
      lineItems: [
        item({ title: "Mushroom Pack (5 stickers)", sku: "PCK-MUSH-5", quantity: 1, options: { Finish: "Matte", Size: "2 in" }, unitPrice: 14 }),
        item({ title: "Holographic Cat Sticker", sku: "STK-CAT-HOLO-3", quantity: 2, options: { Finish: "Foil", Size: "3 in" }, unitPrice: 5.5 }),
      ],
    }),
    order({
      id: "barn-3003",
      label: "Large mixed order",
      number: "3003",
      date: "2026-11-10",
      buyer: "Noah Feldman",
      shipping: 4.5,
      shippingAddress: {
        name: "Noah Feldman",
        line1: "88 Canal Street",
        city: "Boston",
        region: "MA",
        postalCode: "02114",
        country: "United States",
      },
      lineItems: [
        item({ title: "Gold Foil Bee Sticker", sku: "STK-BEE-2-F", quantity: 4, options: { Finish: "Foil", Size: "2 in" }, unitPrice: 4.5 }),
        item({ title: "Frog in a Hat Sticker", sku: "STK-FROG-HAT-3", quantity: 2, options: { Finish: "Matte", Size: "3 in" }, unitPrice: 4 }),
        item({ title: "Wildflowers Art Print", sku: "PRT-WILD-A5", quantity: 1, options: { Finish: "Matte", Size: "A5" }, unitPrice: 18 }),
        item({ title: "Moon Phases Sticker", sku: "STK-MOON-3-F", quantity: 2, options: { Finish: "Foil", Size: "3 in" }, unitPrice: 5.5 }),
        item({ title: "Barn Owl Art Print", sku: "PRT-OWL-A4-F", quantity: 1, options: { Finish: "Foil", Size: "A4" }, unitPrice: 28 }),
        item({ title: "Snail Mail Sticker", sku: "STK-SNAIL-2", quantity: 4, options: { Finish: "Matte", Size: "2 in" }, unitPrice: 3.5 }),
        item({ title: "Sunflower Sticker Sheet", sku: "SHT-SUN-A6", quantity: 1, options: { Finish: "Matte", Size: "A6" }, unitPrice: 9 }),
      ],
    }),
    order({
      id: "barn-3004",
      label: "Over $200",
      number: "3004",
      date: "2026-11-13",
      buyer: "Bramble & Bean Café",
      shipping: 12,
      shippingAddress: {
        name: "Bramble & Bean Café",
        line1: "305 Main Street",
        city: "Bozeman",
        region: "MT",
        postalCode: "59715",
        country: "United States",
      },
      lineItems: [
        item({ title: "Custom Logo Sticker (bulk 100)", sku: "BLK-CUSTOM-100", quantity: 2, options: { Finish: "Matte", Size: "2 in" }, unitPrice: 85 }),
        item({ title: "Barn Owl Art Print", sku: "PRT-OWL-A4-F", quantity: 2, options: { Finish: "Foil", Size: "A4" }, unitPrice: 28 }),
      ],
    }),
    order({
      id: "barn-3005",
      label: "Single item",
      number: "3005",
      date: "2026-11-16",
      buyer: "Riley Chen",
      shipping: 1.5,
      shippingAddress: {
        name: "Riley Chen",
        line1: "17 Orchard Lane",
        city: "Ann Arbor",
        region: "MI",
        postalCode: "48104",
        country: "United States",
      },
      lineItems: [
        item({ title: "Gold Foil Bee Sticker", sku: "STK-BEE-2-F", quantity: 1, options: { Finish: "Foil", Size: "2 in" }, unitPrice: 4.5 }),
      ],
    }),
    order({
      id: "barn-3006",
      label: "International order",
      number: "3006",
      date: "2026-11-19",
      buyer: "Søren Kierkegaard-Østergaard",
      shipping: 9,
      shippingAddress: {
        name: "Søren Kierkegaard-Østergaard",
        line1: "Nørrebrogade 214, 3. tv., c/o Kollektivet Grønne Gård",
        city: "København N",
        postalCode: "2200",
        country: "Denmark",
      },
      lineItems: [
        item({
          title: "Extra Large Holographic Foil Sticker Sheet of Scandinavian Forest Creatures",
          sku: "SHT-FOREST-A4-HOLO",
          quantity: 1,
          options: { Finish: "Foil", Size: "A4" },
          unitPrice: 16,
        }),
        item({ title: "Snail Mail Sticker", sku: "STK-SNAIL-2", quantity: 3, options: { Finish: "Matte", Size: "2 in" }, unitPrice: 3.5 }),
      ],
    }),
  ],
};
