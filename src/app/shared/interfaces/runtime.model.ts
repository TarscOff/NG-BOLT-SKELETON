export interface RuntimeEnvironment {
  API_URL: string;
  KEYCLOAK_URL: string;
}

declare global {
  interface Window {
    env?: RuntimeEnvironment;
  }
}

export const env: RuntimeEnvironment = {
  API_URL: window.env?.API_URL || '/api',
  KEYCLOAK_URL: window.env?.KEYCLOAK_URL || 'https://keycloak.pxl-codit.com/',
};