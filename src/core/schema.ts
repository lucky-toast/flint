// Flint's own data schema (see docs/flint-spec.md, "Data schema").
// Money arrives pre-formatted next to raw numbers, so templates compare numbers and print strings.
// Optional text fields are always present, as "" when absent, so strict variables never throw on them.

export type Platform = "etsy" | "ebay";

export type Address = {
  name: string;
  line1: string;
  line2: string; // "" when absent
  city: string;
  region: string; // "" when absent
  postalCode: string;
  country: string;
};

export type LineItem = {
  title: string;
  sku: string;
  quantity: number;
  /** Variations, e.g. { Glaze: "Speckled", Size: "12 oz" }. Every item in a shop has the same keys. */
  options: Record<string, string>;
  unitPrice: number;
  unitPriceFormatted: string;
  lineTotal: number;
  lineTotalFormatted: string;
  personalization: string; // "" when absent
};

export type Order = {
  id: string;
  /** Picker label, e.g. "Gift order". */
  label: string;
  number: string;
  /** ISO date. */
  date: string;
  buyer: string;
  isGift: boolean;
  giftMessage: string; // "" when absent
  shippingAddress: Address;
  subtotal: number;
  shipping: number;
  total: number;
  currency: string;
  subtotalFormatted: string;
  shippingFormatted: string;
  totalFormatted: string;
  lineItems: LineItem[];
};

export type Shop = {
  id: string;
  name: string;
  platform: Platform;
  /** Asset name -> URL or data URL. Always includes "logo". */
  assets: Record<string, string>;
  orders: Order[];
  defaultOrderId: string;
};

export type Paper = "letter" | "a4" | "4x6";

export type Template = {
  id: string;
  name: string;
  builtIn: boolean;
  paper: Paper;
  /** Liquid source: an HTML fragment (no <html>/<head>); the preview wraps it in a document. */
  source: string;
  updatedAt: string;
};

/** What a template sees when it renders. */
export type RenderContext = {
  shop: { name: string; platform: Platform };
  assets: Record<string, string>;
  order: Order;
};
