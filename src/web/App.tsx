import { builtInTemplates, shops } from "../data";
import { Editor } from "./editor/Editor";

export function App() {
  // The shop switcher and template picker land in a later ticket; until then, the demo shop and template.
  const shop = shops[0]!;
  const template = builtInTemplates[0]!;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Flint</h1>
        <p>
          {shop.name} · {template.name}
        </p>
      </header>
      <main className="app-main">
        <Editor key={`${shop.id}/${template.id}`} shop={shop} template={template} />
      </main>
    </div>
  );
}
