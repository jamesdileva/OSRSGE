/**
 * Application-level services: wiring and orchestration only.
 * Market analysis must never live here (implementation guide §33) —
 * this module only exists so main.ts stays a thin lifecycle owner.
 */

export const APP_VERSION = '0.1.0';

export function getApplicationVersion(): string {
  return APP_VERSION;
}

export function initializeApplicationServices(): void {
  // Sprint 1: nothing to initialize yet.
  // Storage, providers, and ranking services arrive in later sprints.
}
