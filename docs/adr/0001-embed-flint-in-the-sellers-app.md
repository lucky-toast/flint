# Embed hosted Flint in the seller's app through a preload bridge

The seller's desktop app gets a "Design with Flint" menu item that opens the deployed Flint in an Electron view. The app and Flint talk only through a small `window.flintHost` bridge that the app's preload script exposes. Flint's data schema is the contract: the app sends a template and a shop in Flint's shape (branding and mock sample orders, never real orders), and Flint hands the saved template back. This keeps Flint a single standalone web app with no code from the seller's app. The hook only appears in the demo video, and the app's side is built separately in the app's rewrite.

## Considered Options

- **A plugin folder, or a sidecar that watches the template folder.** Both were rejected because they're looser to integrate and less natural to demo than a menu item.
- **Injecting Flint into the app without the app's cooperation.** Rejected outright.
- **Bundling a copy of Flint inside the app.** Rejected for now. Every turn needs the Worker anyway (Ember key, budget, replay), so a bundled copy still needs the network and is a second build to keep in step.
- **Raw `postMessage` instead of a preload bridge.** Rejected because the preload bridge is Electron's safe default (context isolation, no Node access for Flint), and the web app behaves the same when there is no bridge.
- **A second "data profile" so Flint could read the app's own order shape.** Rejected. The app adapts to Flint's schema instead, which gains order-level tax and discount because the marketplaces send them.

## Consequences

- `/api/turn` accepts a shop sent with the request (checked against the schema and capped in size), not only the built-in demo shops.
- In embedded mode the access code comes from the app, not from typing, and the app keeps it in a local setting that is never committed.
- If Flint can't load (offline), the app shows its own "you're offline" page, because a hosted page can't render one.
