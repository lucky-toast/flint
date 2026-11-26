import type { Shop } from "../../core";
import { item, order } from "../money";
import { svgDataUrl } from "../svg";

// Second Stitch: a vintage clothing shop selling on eBay. Every item has the options Size and Condition.

const logo = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 64">
  <rect x="6" y="10" width="44" height="44" rx="22" fill="#2f4858"/>
  <path d="M16 32 h24" stroke="#f2d0a4" stroke-width="3" stroke-dasharray="4 3"/>
  <text x="62" y="41" font-family="Trebuchet MS, sans-serif" font-size="25" fill="#2f4858">Second Stitch</text>
</svg>`);

const hangTag = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <path d="M14 8 h28 l14 14 v34 h-42 Z" fill="none" stroke="#2f4858" stroke-width="3"/>
  <circle cx="42" cy="20" r="4" fill="#2f4858"/>
  <text x="32" y="46" text-anchor="middle" font-family="Trebuchet MS, sans-serif" font-size="11" fill="#2f4858">VINTAGE</text>
</svg>`);

const washCare = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <path d="M8 20 h48 l-6 30 h-36 Z" fill="none" stroke="#2f4858" stroke-width="3"/>
  <path d="M14 30 q6 -5 12 0 t12 0 t12 0" fill="none" stroke="#2f4858" stroke-width="2.5"/>
  <text x="32" y="45" text-anchor="middle" font-family="Trebuchet MS, sans-serif" font-size="11" fill="#2f4858">30°</text>
</svg>`);

export const secondStitch: Shop = {
  id: "second-stitch",
  name: "Second Stitch",
  platform: "ebay",
  assets: { logo, hang_tag: hangTag, wash_care: washCare },
  defaultOrderId: "stitch-2003",
  orders: [
    order({
      id: "stitch-2001",
      label: "Typical order",
      number: "2001",
      date: "2026-11-03",
      buyer: "Jordan Alvarez",
      shipping: 7.5,
      shippingAddress: {
        name: "Jordan Alvarez",
        line1: "3021 Mission Street",
        city: "San Francisco",
        region: "CA",
        postalCode: "94110",
        country: "United States",
      },
      lineItems: [
        item({ title: "1970s Suede Fringe Jacket", sku: "JKT-70-SUE-M", quantity: 1, options: { Size: "M", Condition: "Very good" }, unitPrice: 88 }),
        item({ title: "Levi's 501 Jeans", sku: "JNS-501-W32", quantity: 1, options: { Size: "W32 L30", Condition: "Good" }, unitPrice: 54 }),
      ],
    }),
    order({
      id: "stitch-2002",
      label: "Gift order",
      number: "2002",
      date: "2026-11-06",
      buyer: "Sam Whitaker",
      isGift: true,
      giftMessage: "For your next record-shop crawl. Happy anniversary! Sam x",
      shipping: 6,
      shippingAddress: {
        name: "Alex Whitaker",
        line1: "18 Quarry Hill Road",
        line2: "Unit 2",
        city: "Burlington",
        region: "VT",
        postalCode: "05401",
        country: "United States",
      },
      lineItems: [
        item({ title: "Band Tee, 1988 Tour", sku: "TEE-88-TOUR-L", quantity: 1, options: { Size: "L", Condition: "Good" }, unitPrice: 46 }),
        item({ title: "Silk Paisley Scarf", sku: "SCF-SLK-PSL", quantity: 1, options: { Size: "One size", Condition: "Excellent" }, unitPrice: 32 }),
      ],
    }),
    order({
      id: "stitch-2003",
      label: "Large mixed order",
      number: "2003",
      date: "2026-11-09",
      buyer: "Renee Castillo",
      shipping: 16,
      shippingAddress: {
        name: "Renee Castillo",
        line1: "455 Congress Avenue",
        line2: "Floor 2",
        city: "Austin",
        region: "TX",
        postalCode: "78701",
        country: "United States",
      },
      lineItems: [
        item({ title: "Wool Fisherman Sweater", sku: "SWT-WOL-FSH-M", quantity: 1, options: { Size: "M", Condition: "Very good" }, unitPrice: 64 }),
        item({ title: "Floral Prairie Dress", sku: "DRS-PRA-FLR-S", quantity: 1, options: { Size: "S", Condition: "Excellent" }, unitPrice: 58 }),
        item({ title: "Corduroy Trousers", sku: "TRS-CRD-L", quantity: 2, options: { Size: "L", Condition: "Good" }, unitPrice: 38 }),
        item({ title: "Western Pearl-Snap Shirt", sku: "SHT-WST-M", quantity: 2, options: { Size: "M", Condition: "Very good" }, unitPrice: 42 }),
        item({ title: "Denim Chore Coat", sku: "JKT-CHR-L", quantity: 1, options: { Size: "L", Condition: "Good" }, unitPrice: 76 }),
        item({ title: "Cable Knit Cardigan", sku: "CRD-CBL-S", quantity: 1, options: { Size: "S", Condition: "Very good" }, unitPrice: 48 }),
      ],
    }),
    order({
      id: "stitch-2004",
      label: "Over $200",
      number: "2004",
      date: "2026-11-12",
      buyer: "Olivia Hart",
      shipping: 20,
      shippingAddress: {
        name: "Olivia Hart",
        line1: "220 Riverside Drive",
        line2: "Apt 12C",
        city: "New York",
        region: "NY",
        postalCode: "10025",
        country: "United States",
      },
      lineItems: [
        item({ title: "1960s Shearling Coat", sku: "COT-60-SHR-M", quantity: 1, options: { Size: "M", Condition: "Excellent" }, unitPrice: 265 }),
        item({ title: "Leather Riding Boots", sku: "BTS-LTH-RID-8", quantity: 1, options: { Size: "US 8", Condition: "Very good" }, unitPrice: 120 }),
      ],
    }),
    order({
      id: "stitch-2005",
      label: "Single item",
      number: "2005",
      date: "2026-11-15",
      buyer: "Theo Nguyen",
      shipping: 5,
      shippingAddress: {
        name: "Theo Nguyen",
        line1: "901 Pike Street",
        city: "Seattle",
        region: "WA",
        postalCode: "98101",
        country: "United States",
      },
      lineItems: [
        item({ title: "Varsity Letterman Jacket", sku: "JKT-VAR-L", quantity: 1, options: { Size: "L", Condition: "Good" }, unitPrice: 95 }),
      ],
    }),
    order({
      id: "stitch-2006",
      label: "International order",
      number: "2006",
      date: "2026-11-18",
      buyer: "Aoife Ní Bhriain-Fitzgerald",
      shipping: 28,
      shippingAddress: {
        name: "Aoife Ní Bhriain-Fitzgerald",
        line1: "Flat 7, Ardmore House, 112 Upper Drumcondra Road",
        city: "Dublin",
        postalCode: "D09 F2X4",
        country: "Ireland",
      },
      lineItems: [
        item({
          title: "Hand-Embroidered 1950s Mexican Tourist Circle Skirt with Original Tags",
          sku: "SKT-50-CIR-EMB-XS",
          quantity: 1,
          options: { Size: "XS", Condition: "Excellent" },
          unitPrice: 140,
        }),
        item({ title: "Mohair Beret", sku: "HAT-BRT-MOH", quantity: 1, options: { Size: "One size", Condition: "Very good" }, unitPrice: 26 }),
      ],
    }),
  ],
};
