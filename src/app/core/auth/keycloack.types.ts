import { KeycloakInitOptions } from 'keycloak-js';

export interface AuthRuntimeConfig {
  url: string;
  realm: string;
  clientId: string;
  init?: Partial<KeycloakInitOptions>; // onLoad, pkceMethod, checkLoginIframe, ...
}

export interface AuthProfile {
  name?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  authorization?: string[];
};
