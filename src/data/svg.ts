/** Turns inline SVG markup into a data URL, so fixture assets need no network (the preview CSP allows only data URIs). */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg.trim())}`;
}
