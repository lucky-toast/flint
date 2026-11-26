// Ports for the browser tests. Override E2E_PORT when several checkouts run browser tests at once;
// the Worker's inspector and the fake Ember sit at fixed offsets from it.
export const appPort = Number(process.env.E2E_PORT ?? 8788);
export const inspectorPort = appPort + 1000;
export const fakeEmberPort = appPort + 2000;

export const appURL = `http://127.0.0.1:${appPort}`;
export const fakeEmberURL = `http://127.0.0.1:${fakeEmberPort}`;
