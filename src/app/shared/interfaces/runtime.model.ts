export interface RuntimeEnvironment {
  API_URL: string;
  KEYCLOAK_URL: string;
  KEYCLOAK_REALM: string;
  KEYCLOAK_CLIENT_ID: string;
}

declare global {
  interface Window {
    env?: RuntimeEnvironment;
  }
}

export const env: RuntimeEnvironment = {
  API_URL: window.env?.API_URL || 'undefined',
  KEYCLOAK_URL: window.env?.KEYCLOAK_URL || 'undefined',
  KEYCLOAK_REALM: window.env?.KEYCLOAK_REALM || 'undefined',
  KEYCLOAK_CLIENT_ID: window.env?.KEYCLOAK_CLIENT_ID || 'undefined',
};