import type { Shop } from "../../core";

type Props = { shops: Shop[]; shopId: string; onChange: (shopId: string) => void };

/** Picks which demo shop the seller is: its branding, assets and orders. */
export function ShopSwitcher({ shops, shopId, onChange }: Props) {
  return (
    <label className="shop-switcher">
      Shop
      <select value={shopId} onChange={(e) => onChange(e.target.value)}>
        {shops.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
