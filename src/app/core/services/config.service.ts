import { Injectable } from '@angular/core';
import pkg from '../../../../package.json';
import { AuthRuntimeConfig } from '../auth/keycloack.types';

export interface AppConfig {
    name: string;
    production: boolean;
    apiUrl: string;
    version: string;
    auth: AuthRuntimeConfig;
}

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private config!: AppConfig;

  async loadConfig(): Promise<void> {
    const res = await fetch('/assets/config.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load config: ${res.status} ${res.statusText}`);
    const json = await res.json();
    this.config = { ...json, version: pkg.version };
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }

  getAll(): AppConfig {
    return this.config;
  }
}