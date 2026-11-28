// The tweak experiment's sequences (#40): a first request, then brief tweaks in the same
// conversation, easy to hard. Four run on Classic and four on Compact, all on Kiln & Co.
//
// Each tweak is tagged with where its edit has to land, which is what separates the variants:
//   own   the find must match code Ember wrote in an earlier step (under B, Ember must recall it)
//   orig  the find can be copied from the original template in the first message
//
// Every step has a check of the cumulative result: what the slip should show after that step,
// including what earlier steps asked for. Checks look at rendered slips in a real browser
// (see browser.mjs): visible text, element boxes and visible tables, never the Liquid source.
//
// A check gets ctx:
//   ctx.now(n)       View of order #n rendered with the template after this step
//   ctx.base(n)      View of order #n rendered with the base template
//   ctx.step(i, n)   View of order #n after step i (0-based) of this sequence
//   ctx.order(n)     the order's data (line items, formatted totals)
//   ctx.numbers      every example order number
// and returns [ok, detail].

// ---------- helpers ----------
const fmt = (xs) => xs.map((n) => `#${n}`).join(", ");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Runs every check; passes only if all pass. */
async function all(...checks) {
  const results = [];
  for (const c of checks) results.push(await c());
  const bad = results.filter(([ok]) => !ok);
  return bad.length ? [false, bad.map(([, d]) => d).join(" | ")] : [true, results.map(([, d]) => d).join(" | ")];
}

/** Runs `test(n)` for each order; passes if every one returns true. `test` may return a string to explain a failure. */
async function each(numbers, label, test) {
  const bad = [];
  for (const n of numbers) {
    const r = await test(n);
    if (r !== true) bad.push(typeof r === "string" ? `#${n} ${r}` : `#${n}`);
  }
  return [!bad.length, bad.length ? `${label}: failed on ${bad.join("; ")}` : `${label}: ok`];
}

// Headers often use CSS text-transform, which innerText applies, so compare text case-insensitively.
const sameText = (a, b) => a.toLowerCase() === b.toLowerCase();
const includesText = (a, b) => a.toLowerCase().includes(b.toLowerCase());
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const vOverlap = (a, b) => Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0;

/** Every line item's title is still on every slip. Added to every step: no request here hides items. */
const itemsKept = (c) => () =>
  each(c.numbers, "every item still shown", async (n) => {
    const v = await c.now(n);
    const missing = [];
    for (const li of c.order(n).lineItems) if (!(await v.has(li.title))) missing.push(li.title);
    return missing.length ? `missing ${missing.join(", ")}` : true;
  });

/** The items table(s) on a slip: visible tables with at least one of the order's SKUs or titles in a row. */
async function itemTables(v, order) {
  const keys = order.lineItems.flatMap((li) => [li.sku, li.title]);
  return (await v.tables()).filter((t) => t.rows.some((r) => r.cells.some((cell) => keys.some((k) => cell.text.includes(k)))));
}

/** The table row showing a line item (by SKU, else by title). */
function rowFor(tables, li) {
  for (const t of tables) for (const r of t.rows) if (r.cells.some((c) => c.text.includes(li.sku) || c.text.includes(li.title))) return r;
  return null;
}

// =====================================================================================
// Classic
// =====================================================================================

// ---------- C1 logo ----------
const logoH = async (view) => (await view.img("logo"))?.h;

const logoScale = (c, lo, hi) => async () => {
  const base = await logoH(await c.base("1003")), now = await logoH(await c.now("1003"));
  if (!base || !now) return [false, `logo not visible (base ${base}px, now ${now}px)`];
  const r = now / base;
  return [r >= lo && r <= hi, `logo ${Math.round(base)}px → ${Math.round(now)}px (×${r.toFixed(2)}, want ×${lo}–${hi})`];
};

const logoSmallerThanStep = (c, i) => async () => {
  const base = await logoH(await c.base("1003"));
  const prev = await logoH(await c.step(i, "1003"));
  const now = await logoH(await c.now("1003"));
  if (!base || !prev || !now) return [false, "logo not visible"];
  return [now < prev - 1 && now > base * 1.15, `logo ${Math.round(now)}px (want below step ${i + 1}'s ${Math.round(prev)}px, above ${Math.round(base * 1.15)}px)`];
};

const logoSameAsStep = (c, i) => async () => {
  const prev = await logoH(await c.step(i, "1003")), now = await logoH(await c.now("1003"));
  return [!!prev && !!now && near(prev, now, 1), `logo ${Math.round(now)}px (want step ${i + 1}'s ${Math.round(prev)}px kept)`];
};

const makerMarkNextToLogo = (c) => () =>
  each(c.numbers, "maker mark beside the logo", async (n) => {
    const v = await c.now(n);
    const logo = await v.img("logo"), mark = await v.img("maker_mark");
    if (!logo) return "logo not visible";
    if (!mark) return "maker mark not visible";
    if (!vOverlap(logo, mark)) return "not on the logo's row";
    const gap = mark.x >= logo.x + logo.w ? mark.x - (logo.x + logo.w) : logo.x - (mark.x + mark.w);
    return gap >= -1 && gap <= 80 ? true : `${Math.round(gap)}px from the logo`;
  });

// ---------- C2 sort (order #1003) ----------
const SKUS_1003 = ["MUG-12-TNM", "PLT-DIN-CEL", "PLT-SID-CEL", "VAS-BUD-SPK", "BWL-SRV-SPK", "BWL-RMN-TNM", "PLN-MIN-SHN"];
const SKU_ASC_TIES = ["MUG-12-TNM", "BWL-RMN-TNM", "PLT-DIN-CEL", "PLT-SID-CEL", "BWL-SRV-SPK", "PLN-MIN-SHN", "VAS-BUD-SPK"];
const SKU_DESC_TIES = ["MUG-12-TNM", "PLT-SID-CEL", "PLT-DIN-CEL", "BWL-RMN-TNM", "VAS-BUD-SPK", "PLN-MIN-SHN", "BWL-SRV-SPK"];

const quantityDesc = (c) => async () => {
  const qty = Object.fromEntries(c.order("1003").lineItems.map((li) => [li.sku, li.quantity]));
  const got = await (await c.now("1003")).order(SKUS_1003);
  const q = got.map((s) => qty[s]);
  const ok = got.length === SKUS_1003.length && q.every((v, i) => i === 0 || q[i - 1] >= v);
  return [ok, `#1003 quantities top to bottom: ${q.join(",")}`];
};

const exactOrder = (c, want) => async () => {
  const got = await (await c.now("1003")).order(SKUS_1003);
  return [same(got, want), same(got, want) ? "#1003 order correct" : `#1003 order ${got.join(",")} (want ${want.join(",")})`];
};

// ---------- C3 promo ----------
const PROMO = "Free mystery mini planter";
const promoRow = async (v, order) => {
  for (const t of await itemTables(v, order)) {
    const i = t.rows.findIndex((r) => r.cells.some((cell) => cell.text.toLowerCase().includes(PROMO.toLowerCase())));
    if (i >= 0) return { table: t, index: i, row: t.rows[i] };
  }
  return null;
};

const promoOn = (c, yes) => () =>
  each(c.numbers, `promo row on ${fmt(yes)} only`, async (n) => {
    const v = await c.now(n);
    const shown = (await v.text()).toLowerCase().includes(PROMO.toLowerCase());
    if (!yes.includes(n)) return shown ? "has the promo" : true;
    const p = await promoRow(v, c.order(n));
    if (!p) return shown ? "promo shown but not as a row of the items table" : "no promo";
    const cells = p.row.cells.map((x) => x.text);
    if (!cells.includes("1")) return `promo row has no quantity 1 (${cells.join(" | ")})`;
    if (!cells.some((x) => x.includes("$0.00"))) return `promo row has no $0.00 (${cells.join(" | ")})`;
    return true;
  });

const promoFirstRow = (c, yes) => () =>
  each(yes, "promo is the first item row", async (n) => {
    const p = await promoRow(await c.now(n), c.order(n));
    if (!p) return "no promo row";
    const firstBody = p.table.rows.findIndex((r) => !r.header);
    return p.index === firstBody ? true : `promo is body row ${p.index - firstBody + 1}`;
  });

// ---------- C4 glaze tables (order #1003) ----------
const GLAZES = ["Celadon", "Shino", "Speckled", "Tenmoku"];
// Subtotals per glaze on #1003: Celadon 72+48, Shino 22, Speckled 28+72, Tenmoku 136+96.
const GLAZE_SUBTOTAL = { Celadon: 120, Shino: 22, Speckled: 100, Tenmoku: 232 };

/** The glaze sections on #1003: one per items table, with its glaze, box and the heading found above it. */
async function glazeSections(c) {
  const v = await c.now("1003");
  const order = c.order("1003");
  const glazeOf = Object.fromEntries(order.lineItems.map((li) => [li.sku, li.options.Glaze]));
  const tables = (await itemTables(v, order)).sort((a, b) => a.rect.y - b.rect.y);
  const sections = [];
  let above = 0;
  for (const t of tables) {
    const skus = order.lineItems.filter((li) => t.rows.some((r) => r.cells.some((cell) => cell.text.includes(li.sku)))).map((li) => li.sku);
    const glazes = [...new Set(skus.map((s) => glazeOf[s]))];
    // The heading may sit above the table, or inside it as a caption or a header row.
    const inside = t.rows.filter((r) => r.header).map((r) => r.cells.map((x) => x.text).join(" ")).join(" ");
    const heading = `${await v.textIn(above, t.rect.y)} ${inside}`;
    sections.push({ table: t, skus, glazes, heading });
    above = t.rect.y + t.rect.h;
  }
  return { v, sections };
}

const glazeTables = (c) => async () => {
  const { sections } = await glazeSections(c);
  const problems = [];
  if (sections.length !== GLAZES.length) problems.push(`${sections.length} item tables (want ${GLAZES.length})`);
  for (const s of sections) {
    if (s.glazes.length !== 1) problems.push(`a table mixes ${s.glazes.join("+") || "no items"}`);
    else if (!includesText(s.heading, s.glazes[0])) problems.push(`no "${s.glazes[0]}" heading above its table`);
  }
  const counted = sections.flatMap((s) => s.skus);
  for (const sku of SKUS_1003) {
    const k = counted.filter((x) => x === sku).length;
    if (k !== 1) problems.push(`${sku} in ${k} tables`);
  }
  return [!problems.length, problems.length ? `#1003 glaze tables: ${problems.join("; ")}` : "#1003 one headed table per glaze"];
};

const glazesAlphabetical = (c) => async () => {
  const { sections } = await glazeSections(c);
  const got = sections.map((s) => s.glazes.join("+"));
  return [same(got, GLAZES), `#1003 glaze order: ${got.join(", ")}`];
};

const glazeSubtotals = (c) => async () => {
  const { v, sections } = await glazeSections(c);
  const bad = [];
  for (const [i, s] of sections.entries()) {
    const g = s.glazes[0];
    const top = s.table.rect.y + s.table.rect.h - 0.5;
    const next = sections[i + 1]?.table.rect.y ?? top + 200;
    // Under the table, or in a last row of its own (a footer row with no item in it).
    const last = s.table.rows.at(-1);
    const lastRow = last && !s.skus.some((sku) => last.cells.some((x) => x.text.includes(sku))) ? last.cells.map((x) => x.text).join(" ") : "";
    const below = `${await v.textIn(top, next)} ${lastRow}`;
    const want = GLAZE_SUBTOTAL[g];
    if (!new RegExp(`\\$${want}(\\.00)?(?![\\d.])`).test(below)) bad.push(`${g} (want $${want}, found "${below.slice(0, 60)}")`);
  }
  return [!bad.length, bad.length ? `#1003 subtotal missing under ${bad.join("; ")}` : "#1003 subtotal under each glaze"];
};

// =====================================================================================
// Compact
// =====================================================================================

// ---------- K1 closing line ----------
const STUDIO = "Thanks for supporting a small studio";
const belowItems = async (v, order, box) => {
  const tables = await itemTables(v, order);
  const bottom = Math.max(...tables.map((t) => t.rect.y + t.rect.h));
  return box.y >= bottom - 1;
};

// After step 1 the line may gain a name anywhere, so later steps find it by "small studio".
const ANCHOR = "small studio";

const closingLine = (c, numbers, exact) => () =>
  each(numbers, "closing line below the items", async (n) => {
    const v = await c.now(n);
    const line = await v.lineWith(exact ? STUDIO : ANCHOR);
    if (!line) return exact ? `no "${STUDIO}!"` : "no closing line";
    return (await belowItems(v, c.order(n), line.rect)) ? true : "not below the items";
  });

const firstName = (c, cases) => () =>
  each(cases.map(([n]) => n), "buyer's first name in the closing line", async (n) => {
    const [, first, last] = cases.find(([x]) => x === n);
    const line = await (await c.now(n)).lineWith(ANCHOR);
    if (!line) return "no closing line";
    if (!line.text.includes(first)) return `"${line.text}" has no "${first}"`;
    return line.text.includes(last) ? `"${line.text}" has the last name too` : true;
  });
const NAMES = [["1001", "Priya", "Shah"], ["1003", "Hannah", "Lindqvist"], ["1006", "Maximiliane", "Hohenstein"]];

const giftClosing = (c) => () =>
  each(c.numbers, '"Enjoy your gift!" on gift orders only', async (n) => {
    const v = await c.now(n);
    const enjoy = await v.lineWith("Enjoy your gift!");
    const studio = await v.has(ANCHOR);
    if (c.order(n).isGift) {
      if (!enjoy) return 'no "Enjoy your gift!"';
      if (studio) return "still has the studio line";
      return (await belowItems(v, c.order(n), enjoy.rect)) ? true : '"Enjoy your gift!" not below the items';
    }
    if (enjoy) return 'has "Enjoy your gift!"';
    return studio ? true : "lost the studio line";
  });

// ---------- K2 gift ----------
const GIFT = "1002";

const giftSkusHidden = (c) => () =>
  each(c.numbers, "SKUs hidden on gift orders only", async (n) => {
    const v = await c.now(n);
    const order = c.order(n);
    const shown = [];
    for (const li of order.lineItems) if (await v.has(li.sku)) shown.push(li.sku);
    const header = (await itemTables(v, order)).some((t) => t.rows.some((r) => r.header && r.cells.some((x) => /^sku$/i.test(x.text))));
    if (order.isGift) return shown.length ? `shows ${shown.join(", ")}` : header ? "SKU header still shown" : true;
    return shown.length === order.lineItems.length && header ? true : "lost its SKUs";
  });

const giftBannerTop = (c) => () =>
  each(c.numbers, '"A gift for you" at the top of gift orders only', async (n) => {
    const v = await c.now(n);
    const b = await v.box("A gift for you");
    if (!c.order(n).isGift) return b ? "has the gift note" : true;
    if (!b) return "no gift note";
    const ship = await v.box("Ship to");
    const firstRow = rowFor(await itemTables(v, c.order(n)), c.order(n).lineItems[0]);
    if (ship && b.y > ship.y) return "below Ship to";
    if (firstRow && b.y > firstRow.cells[0].rect.y) return "below the items";
    return true;
  });

const giftBuyerHidden = (c) => () =>
  each(c.numbers, "buyer hidden on gift orders only, recipient kept", async (n) => {
    const v = await c.now(n);
    const o = c.order(n);
    if (o.isGift) {
      if (await v.has(o.buyer)) return `still shows ${o.buyer}`;
      return (await v.has(o.shippingAddress.name)) ? true : `lost the recipient ${o.shippingAddress.name}`;
    }
    return (await v.has(o.buyer)) ? true : `lost the buyer ${o.buyer}`;
  });

// ---------- K3 prices ----------
const pricesShown = (c, numbers) => () =>
  each(numbers, "each item's price and the order total shown", async (n) => {
    const v = await c.now(n);
    const o = c.order(n);
    const tables = await itemTables(v, o);
    for (const li of o.lineItems) {
      const r = rowFor(tables, li);
      if (!r) return `no row for ${li.sku}`;
      if (!r.cells.some((x) => x.text.includes(li.unitPriceFormatted) || x.text.includes(li.lineTotalFormatted))) return `no price on ${li.sku}'s row`;
    }
    const total = await v.box(o.totalFormatted);
    if (!total) return `no total ${o.totalFormatted}`;
    return (await belowItems(v, o, total)) ? true : "total not below the items";
  });

const noPricesOnGift = (c) => () =>
  each([GIFT], "no prices on the gift order", async (n) => {
    const t = await (await c.now(n)).text();
    return t.includes("$") ? `still shows "${t.slice(t.indexOf("$") - 20, t.indexOf("$") + 10)}"` : true;
  });

const giftNoteWhereTotalWas = (c, pricedStep) => () =>
  each(c.numbers, '"A gift for you" where the total was, on gift orders only', async (n) => {
    const v = await c.now(n);
    const note = await v.box("A gift for you");
    if (!c.order(n).isGift) return note ? "has the gift note" : true;
    if (!note) return "no gift note";
    const was = await (await c.step(pricedStep, n)).box(c.order(n).totalFormatted);
    if (!was) return `step ${pricedStep + 1} showed no total to compare with`;
    return near(note.y, was.y, 40) ? true : `note at y=${Math.round(note.y)}, total was at y=${Math.round(was.y)}`;
  });

// ---------- K4 option columns (every order) ----------
async function columns(v, order) {
  const t = (await itemTables(v, order))[0];
  if (!t) return null;
  const head = t.rows.find((r) => r.header);
  const body = t.rows.filter((r) => !r.header);
  return { head: head?.cells.map((x) => x.text) ?? [], body };
}

const optionColumns = (c) => () =>
  each(c.numbers, "Glaze and Size in their own columns, under the right headers", async (n) => {
    const v = await c.now(n);
    const o = c.order(n);
    const cols = await columns(v, o);
    if (!cols) return "no items table";
    const gi = cols.head.findIndex((h) => /^glaze$/i.test(h)), si = cols.head.findIndex((h) => /^size$/i.test(h));
    if (gi < 0 || si < 0) return `headers ${cols.head.join(" | ")}`;
    for (const li of o.lineItems) {
      const r = cols.body.find((row) => row.cells.some((x) => x.text.includes(li.title)));
      if (!r) return `no row for ${li.title}`;
      if (r.cells.length !== cols.head.length) return `${li.title}'s row has ${r.cells.length} cells for ${cols.head.length} headers`;
      if (!sameText(r.cells[gi].text, li.options.Glaze) || !sameText(r.cells[si].text, li.options.Size)) return `${li.title}: Glaze "${r.cells[gi].text}", Size "${r.cells[si].text}"`;
      if (/Glaze:|Size:/.test(r.cells.map((x) => x.text).join(" "))) return `${li.title} still lists options under its name`;
    }
    return true;
  });

const skuColumn = (c, present) => () =>
  each(c.numbers, present ? "SKU column kept" : "SKU column removed", async (n) => {
    const v = await c.now(n);
    const o = c.order(n);
    const cols = await columns(v, o);
    const header = cols?.head.some((h) => /^sku$/i.test(h));
    let shown = 0;
    for (const li of o.lineItems) if (await v.has(li.sku)) shown++;
    if (present) return header && shown === o.lineItems.length ? true : "SKUs missing";
    return !header && shown === 0 ? true : `SKU header ${header ? "kept" : "gone"}, ${shown} SKUs shown`;
  });

const sizeAfterQty = (c) => () =>
  each(c.numbers, "Size right after Qty, header over its cells", async (n) => {
    const v = await c.now(n);
    const cols = await columns(v, c.order(n));
    if (!cols) return "no items table";
    const qi = cols.head.findIndex((h) => /^qty$/i.test(h)), si = cols.head.findIndex((h) => /^size$/i.test(h));
    if (qi < 0 || si !== qi + 1) return `headers ${cols.head.join(" | ")}`;
    return true;
  });

// =====================================================================================
// The sequences
// =====================================================================================
export const SEQUENCES = [
  {
    id: "C1-logo",
    template: "classic",
    level: "easy",
    steps: [
      { text: "Make the logo about twice as big.", check: (c) => all(logoScale(c, 1.7, 2.4), itemsKept(c)) },
      { text: "A bit smaller.", finds: "own", check: (c) => all(logoSmallerThanStep(c, 0), itemsKept(c)) },
      { text: "Now add the maker mark next to it.", finds: "orig", check: (c) => all(makerMarkNextToLogo(c), logoSameAsStep(c, 1), itemsKept(c)) },
    ],
  },
  {
    id: "C2-sort",
    template: "classic",
    level: "medium",
    steps: [
      { text: "Sort the items by quantity, highest first.", check: (c) => all(quantityDesc(c), itemsKept(c)) },
      { text: "Break ties by SKU.", finds: "own", check: (c) => all(exactOrder(c, SKU_ASC_TIES), itemsKept(c)) },
      { text: "Reverse the SKU tie-break.", finds: "own", check: (c) => all(exactOrder(c, SKU_DESC_TIES), itemsKept(c)) },
    ],
  },
  {
    id: "C3-promo",
    template: "classic",
    level: "hard",
    steps: [
      {
        text: 'On orders over $200, add a line to the items table: "Free mystery mini planter", quantity 1, price $0.00.',
        check: (c) => all(promoOn(c, ["1003", "1004"]), itemsKept(c)),
      },
      // $100 so subtotal and total agree on every order (#1006: subtotal $144, total $176).
      { text: "Make it orders over $100.", finds: "own", check: (c) => all(promoOn(c, ["1001", "1003", "1004", "1006"]), itemsKept(c)) },
      {
        text: "Move it to the top of the table.",
        finds: "own",
        check: (c) => all(promoFirstRow(c, ["1001", "1003", "1004", "1006"]), promoOn(c, ["1001", "1003", "1004", "1006"]), itemsKept(c)),
      },
    ],
  },
  {
    id: "C4-glaze-tables",
    template: "classic",
    level: "hard",
    steps: [
      {
        text: "Instead of one items table, show a separate table for each glaze, with the glaze name as a heading.",
        check: (c) => all(glazeTables(c), itemsKept(c)),
      },
      { text: "Sort the glazes alphabetically.", finds: "own", check: (c) => all(glazesAlphabetical(c), glazeTables(c), itemsKept(c)) },
      { text: "Add a subtotal under each table.", finds: "own", check: (c) => all(glazeSubtotals(c), glazesAlphabetical(c), glazeTables(c), itemsKept(c)) },
    ],
  },
  {
    id: "K1-closing-line",
    template: "compact",
    level: "easy",
    steps: [
      { text: 'End the slip with the line "Thanks for supporting a small studio!"', check: (c) => all(closingLine(c, c.numbers, true), itemsKept(c)) },
      { text: "Add the buyer's first name.", finds: "own", check: (c) => all(firstName(c, NAMES), closingLine(c, c.numbers, false), itemsKept(c)) },
      {
        text: 'On gifts, say "Enjoy your gift!" instead.',
        finds: "own",
        check: (c) => all(giftClosing(c), firstName(c, NAMES), itemsKept(c)),
      },
    ],
  },
  {
    id: "K2-gift",
    template: "compact",
    level: "medium",
    steps: [
      { text: "On gift orders, hide the SKUs.", check: (c) => all(giftSkusHidden(c), itemsKept(c)) },
      { text: 'Add "A gift for you" at the top.', finds: "orig", check: (c) => all(giftBannerTop(c), giftSkusHidden(c), itemsKept(c)) },
      { text: "Hide the buyer's name too.", finds: "orig", check: (c) => all(giftBuyerHidden(c), giftBannerTop(c), giftSkusHidden(c), itemsKept(c)) },
    ],
  },
  {
    id: "K3-prices",
    template: "compact",
    level: "medium-hard",
    steps: [
      { text: "Show each item's price and the order total.", check: (c) => all(pricesShown(c, c.numbers), itemsKept(c)) },
      {
        text: "Hide them on gift orders.",
        finds: "own",
        check: (c) => all(noPricesOnGift(c), pricesShown(c, c.numbers.filter((n) => n !== GIFT)), itemsKept(c)),
      },
      {
        text: 'Show "A gift for you" there instead.',
        finds: "own",
        check: (c) => all(giftNoteWhereTotalWas(c, 0), noPricesOnGift(c), pricesShown(c, c.numbers.filter((n) => n !== GIFT)), itemsKept(c)),
      },
    ],
  },
  {
    id: "K4-option-columns",
    template: "compact",
    level: "hard",
    steps: [
      {
        text: "Show Glaze and Size as their own columns instead of under the item name.",
        check: (c) => all(optionColumns(c), skuColumn(c, true), itemsKept(c)),
      },
      // The SKU cells are original, but they sit right next to the cells Ember added in step 1.
      { text: "Remove the SKU column.", finds: "orig", check: (c) => all(skuColumn(c, false), optionColumns(c), itemsKept(c)) },
      { text: "Move Size next to Qty.", finds: "own", check: (c) => all(sizeAfterQty(c), optionColumns(c), skuColumn(c, false), itemsKept(c)) },
    ],
  },
];
