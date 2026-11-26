import type { Paper, Shop, Template } from "../../core";
import { defaultOrder } from "../../data";
import { SlipPreview } from "../SlipPreview";
import { useRenderedSlip } from "../editor/useRenderedSlip";

type Props = {
  shop: Shop;
  builtIn: Template[];
  /** The seller's saved templates for this shop. */
  saved: Template[];
  onCustomize: (template: Template) => void;
};

const PAPER_LABELS: Record<Paper, string> = { letter: "Letter", a4: "A4", "4x6": "4×6" };

/** The built-in and saved templates for one shop, each previewed with the shop's default order. */
export function TemplatePicker({ shop, builtIn, saved, onCustomize }: Props) {
  return (
    <div className="template-picker">
      <section aria-label="Built-in templates">
        <h2>Built-in templates</h2>
        <TemplateGrid shop={shop} templates={builtIn} onCustomize={onCustomize} />
      </section>
      <section aria-label="Your templates">
        <h2>Your templates</h2>
        {saved.length > 0 ? (
          <TemplateGrid shop={shop} templates={saved} onCustomize={onCustomize} />
        ) : (
          <p className="template-picker-empty">Templates you save for {shop.name} show up here.</p>
        )}
      </section>
    </div>
  );
}

function TemplateGrid({ shop, templates, onCustomize }: Omit<Props, "builtIn" | "saved"> & { templates: Template[] }) {
  return (
    <ul className="template-grid">
      {templates.map((t) => (
        <li key={t.id}>
          <TemplateCard shop={shop} template={t} onCustomize={() => onCustomize(t)} />
        </li>
      ))}
    </ul>
  );
}

function TemplateCard({ shop, template, onCustomize }: { shop: Shop; template: Template; onCustomize: () => void }) {
  const rendered = useRenderedSlip(template.source, shop, defaultOrder(shop));
  return (
    <article className="template-card" aria-label={template.name}>
      <header>
        <h3>{template.name}</h3>
        <span className="template-paper">{PAPER_LABELS[template.paper]}</span>
      </header>
      <div className="template-card-preview">
        {rendered.status === "ok" && <SlipPreview title={`${template.name} preview`} html={rendered.html} paper={template.paper} />}
        {rendered.status === "rendering" && <p className="slip-status">Rendering…</p>}
        {rendered.status === "error" && (
          <p className="slip-status" role="alert">
            This template couldn't be rendered: {rendered.message}
          </p>
        )}
      </div>
      <button type="button" onClick={onCustomize}>
        Customize with Flint
      </button>
    </article>
  );
}
