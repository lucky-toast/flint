import { useCallback, useMemo, useRef, useState } from "react";
import type { Shop } from "../../core";
import { loadUploadedAssets, saveUploadedAsset, type UploadResult } from "./asset-store";

export type UploadedAssetsApi = {
  /** The shop's own assets plus this browser's uploads, for rendering slips. */
  assets: Record<string, string>;
  /** The uploaded names right now (up to date immediately after an upload, before re-render). */
  uploadedNames: () => string[];
  upload: (file: File, name: string) => Promise<UploadResult>;
};

/** The seller's uploaded images for one shop, loaded from and saved to this browser. */
export function useUploadedAssets(shop: Shop): UploadedAssetsApi {
  const [uploaded, setUploaded] = useState(() => loadUploadedAssets(shop.id));
  const latest = useRef(uploaded);

  const assets = useMemo(() => ({ ...uploaded, ...shop.assets }), [uploaded, shop.assets]);
  const uploadedNames = useCallback(() => Object.keys(latest.current), []);

  const upload = useCallback(
    async (file: File, name: string) => {
      const result = await saveUploadedAsset(shop.id, shop.assets, file, name);
      if (result.ok) {
        latest.current = loadUploadedAssets(shop.id);
        setUploaded(latest.current);
      }
      return result;
    },
    [shop.id, shop.assets],
  );

  return { assets, uploadedNames, upload };
}
