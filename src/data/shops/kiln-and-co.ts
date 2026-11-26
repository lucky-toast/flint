import type { Shop } from "../../core";
import { item, order } from "../money";
import { svgDataUrl } from "../svg";

// Kiln & Co.: a small ceramics studio selling on Etsy. Every item has the options Glaze and Size.

const logo = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 64">
  <circle cx="32" cy="32" r="26" fill="#b5532f"/>
  <path d="M20 42 Q32 14 44 42 Z" fill="#f6e7d8"/>
  <text x="70" y="41" font-family="Georgia, serif" font-size="26" fill="#3b2a22">Kiln &amp; Co.</text>
</svg>`);

const makerMark = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="29" fill="none" stroke="#3b2a22" stroke-width="3"/>
  <text x="32" y="38" text-anchor="middle" font-family="Georgia, serif" font-size="16" fill="#3b2a22">K&amp;C</text>
</svg>`);

const careIcon = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="8" y="14" width="48" height="36" rx="6" fill="none" stroke="#3b2a22" stroke-width="3"/>
  <path d="M18 26 h28 M18 34 h28 M18 42 h18" stroke="#3b2a22" stroke-width="3"/>
</svg>`);

export const kilnAndCo: Shop = {
  id: "kiln-and-co",
  name: "Kiln & Co.",
  platform: "etsy",
  assets: { logo, maker_mark: makerMark, care_icon: careIcon },
  defaultOrderId: "kiln-1003",
  orders: [
    order({
      id: "kiln-1001",
      label: "Typical order",
      number: "1001",
      date: "2026-11-02",
      buyer: "Priya Shah",
      shipping: 8.5,
      shippingAddress: {
        name: "Priya Shah",
        line1: "214 Alder Street",
        line2: "Apt 3B",
        city: "Portland",
        region: "OR",
        postalCode: "97205",
        country: "United States",
      },
      lineItems: [
        item({ title: "Everyday Mug", sku: "MUG-12-SPK", quantity: 2, options: { Glaze: "Speckled", Size: "12 oz" }, unitPrice: 34 }),
        item({ title: "Ramen Bowl", sku: "BWL-RMN-CEL", quantity: 1, options: { Glaze: "Celadon", Size: "Large" }, unitPrice: 48 }),
      ],
    }),
    order({
      id: "kiln-1002",
      label: "Gift order",
      number: "1002",
      date: "2026-11-05",
      buyer: "Daniel Okafor",
      isGift: true,
      giftMessage: "Happy birthday, Mira! Fill this with something warm. Love, Dan",
      shipping: 6,
      shippingAddress: {
        name: "Mira Okafor",
        line1: "9 Willow Lane",
        city: "Asheville",
        region: "NC",
        postalCode: "28801",
        country: "United States",
      },
      lineItems: [
        item({
          title: "Initial Mug",
          sku: "MUG-16-SHN",
          quantity: 1,
          options: { Glaze: "Shino", Size: "16 oz" },
          unitPrice: 42,
          personalization: "Letter M on the handle side",
        }),
        item({ title: "Tea Bag Rest", sku: "RST-TEA-SHN", quantity: 1, options: { Glaze: "Shino", Size: "Small" }, unitPrice: 14 }),
      ],
    }),
    order({
      id: "kiln-1003",
      label: "Large mixed order",
      number: "1003",
      date: "2026-11-08",
      buyer: "Hannah Lindqvist",
      shipping: 18,
      shippingAddress: {
        name: "Hannah Lindqvist",
        line1: "77 Market Street",
        line2: "Suite 400",
        city: "San Francisco",
        region: "CA",
        postalCode: "94103",
        country: "United States",
      },
      lineItems: [
        item({ title: "Everyday Mug", sku: "MUG-12-TNM", quantity: 4, options: { Glaze: "Tenmoku", Size: "12 oz" }, unitPrice: 34 }),
        item({ title: "Dinner Plate", sku: "PLT-DIN-CEL", quantity: 2, options: { Glaze: "Celadon", Size: "Large" }, unitPrice: 36 }),
        item({ title: "Side Plate", sku: "PLT-SID-CEL", quantity: 2, options: { Glaze: "Celadon", Size: "Small" }, unitPrice: 24 }),
        item({ title: "Bud Vase", sku: "VAS-BUD-SPK", quantity: 1, options: { Glaze: "Speckled", Size: "Small" }, unitPrice: 28 }),
        item({ title: "Serving Bowl", sku: "BWL-SRV-SPK", quantity: 1, options: { Glaze: "Speckled", Size: "Large" }, unitPrice: 72 }),
        item({ title: "Ramen Bowl", sku: "BWL-RMN-TNM", quantity: 2, options: { Glaze: "Tenmoku", Size: "Large" }, unitPrice: 48 }),
        item({ title: "Mini Planter", sku: "PLN-MIN-SHN", quantity: 1, options: { Glaze: "Shino", Size: "Small" }, unitPrice: 22 }),
      ],
    }),
    order({
      id: "kiln-1004",
      label: "Over $200",
      number: "1004",
      date: "2026-11-11",
      buyer: "Marcus Bell",
      shipping: 24,
      shippingAddress: {
        name: "Marcus Bell",
        line1: "1600 Elm Avenue",
        city: "Chicago",
        region: "IL",
        postalCode: "60614",
        country: "United States",
      },
      lineItems: [
        item({ title: "Dinnerware Set for Four", sku: "SET-DIN-4-MWH", quantity: 1, options: { Glaze: "Matte White", Size: "Set of 4" }, unitPrice: 240 }),
        item({ title: "Serving Bowl", sku: "BWL-SRV-MWH", quantity: 1, options: { Glaze: "Matte White", Size: "Large" }, unitPrice: 72 }),
      ],
    }),
    order({
      id: "kiln-1005",
      label: "Single item",
      number: "1005",
      date: "2026-11-14",
      buyer: "Lee Tran",
      shipping: 5,
      shippingAddress: {
        name: "Lee Tran",
        line1: "48 Harbor Road",
        city: "Providence",
        region: "RI",
        postalCode: "02903",
        country: "United States",
      },
      lineItems: [
        item({ title: "Bud Vase", sku: "VAS-BUD-CEL", quantity: 1, options: { Glaze: "Celadon", Size: "Small" }, unitPrice: 28 }),
      ],
    }),
    order({
      id: "kiln-1006",
      label: "International order",
      number: "1006",
      date: "2026-11-17",
      buyer: "Maximiliane von Hohenstein-Brandenburg",
      shipping: 32,
      shippingAddress: {
        name: "Maximiliane von Hohenstein-Brandenburg",
        line1: "Kurfürstendamm 195, Hinterhaus, 4. Obergeschoss",
        city: "Berlin",
        postalCode: "10707",
        country: "Germany",
      },
      lineItems: [
        item({
          title: "Extra Large Hand-Thrown Stoneware Fruit Bowl with Carved Rim",
          sku: "BWL-FRT-XL-TNM",
          quantity: 1,
          options: { Glaze: "Tenmoku", Size: "Extra Large" },
          unitPrice: 110,
        }),
        item({ title: "Everyday Mug", sku: "MUG-12-MWH", quantity: 1, options: { Glaze: "Matte White", Size: "12 oz" }, unitPrice: 34 }),
      ],
    }),
  ],
};
