// Cypress runs the reporter (dist/index.js) in its main process and setupNodeEvents/the
// plugin (dist/plugin/index.js) in a child process it forks for config/event loading -
// confirmed empirically (Cypress 15.4.0, Windows): the plugin process's process.ppid
// equals the reporter process's own process.pid. So each side can independently derive
// the *same* id, with no handshake needed to agree on it up front, and the id is unique
// per `cypress run` invocation - unlike the old hardcoded id, two concurrent local runs
// (e.g. parallel workers on the same machine rather than separate CI runners) won't
// collide on the same node-ipc socket/pipe path.
//
// This relationship isn't documented, stable Cypress API - if it ever doesn't hold (a
// future Cypress version, `cypress open`, a different OS), the id simply won't match and
// the plugin will never connect. There is no fallback in that case; verify against a real
// Cypress run before relying on this in an unfamiliar environment/version.
export function getServerIpcChannelId(): string {
  return `orangebeard-${process.pid}`;
}

export function getClientIpcChannelId(): string {
  return `orangebeard-${process.ppid}`;
}
