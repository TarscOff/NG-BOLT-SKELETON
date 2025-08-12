import Keycloak from 'keycloak-js';
import { AuthRuntimeConfig } from '../auth/keycloack.types';

let kc: Keycloak | null = null;

export async function initKeycloak(cfg: AuthRuntimeConfig) {
  kc = new (Keycloak)({
    url: cfg.url,
    realm: cfg.realm,
    clientId: cfg.clientId,
  });

  await kc?.init({
    onLoad: cfg.init?.onLoad ?? 'login-required',  // full-page redirect if not logged in
    checkLoginIframe: false,                       // no iframe (CSP-friendly)
    pkceMethod: cfg.init?.pkceMethod ?? 'S256',
  });

  // background refresh (no iframe)
  window.setInterval(async () => {
    if (!kc?.authenticated) return;
    try {
      await kc.updateToken(60);
    } catch {
      kc?.login(); // session ended, go login
    }
  }, 20000);

  return kc;
}

export function keycloak(): Keycloak {
  if (!kc) throw new Error('Keycloak not initialized');
  return kc;
}
