// Ports for the browser tests. Override E2E_PORT when several checkouts run browser tests at once;
// the Worker's inspector, the fake Ember and the paused Worker sit at fixed offsets from it.
export const appPort = Number(process.env.E2E_PORT ?? 8788);
export const inspectorPort = appPort + 1000;
export const fakeEmberPort = appPort + 2000;
/** A second Worker with the kill switch off (LIVE_MODE not "on"), for the paused-live tests. */
export const pausedAppPort = appPort + 3000;
export const pausedInspectorPort = appPort + 4000;

export const appURL = `http://127.0.0.1:${appPort}`;
export const fakeEmberURL = `http://127.0.0.1:${fakeEmberPort}`;
export const pausedAppURL = `http://127.0.0.1:${pausedAppPort}`;
