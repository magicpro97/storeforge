import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { StoreForgeConfig } from '../types/index.js';

const CONFIG_DIR = join(homedir(), '.storeforge');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function loadConfig(): StoreForgeConfig {
  ensureConfigDir();

  if (!existsSync(CONFIG_PATH)) {
    return getDefaultConfig();
  }

  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as StoreForgeConfig;
  } catch {
    return getDefaultConfig();
  }
}

export function saveConfig(config: StoreForgeConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function getDefaultConfig(): StoreForgeConfig {
  return {
    apple: {
      issuerId: '',
      keyId: '',
      privateKeyPath: '',
    },
    google: {
      serviceAccountPath: '',
      packageName: '',
    },
  };
}

export function getConfigValue(key: string): string | undefined {
  const config = loadConfig();
  const parts = key.split('.');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = config;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }

  return typeof current === 'string' ? current : JSON.stringify(current);
}

export function setConfigValue(key: string, value: string): void {
  const config = loadConfig();
  const parts = key.split('.');

  if (parts.length !== 2) {
    throw new Error(`Invalid config key: ${key}. Use format: section.key (e.g., apple.keyId)`);
  }

  const [section, field] = parts;

  if (section === 'apple') {
    if (!(field! in config.apple)) {
      throw new Error(`Unknown Apple config key: ${field}`);
    }
    (config.apple as unknown as Record<string, string>)[field!] = value;
  } else if (section === 'google') {
    if (!(field! in config.google)) {
      throw new Error(`Unknown Google config key: ${field}`);
    }
    (config.google as unknown as Record<string, string>)[field!] = value;
  } else {
    throw new Error(`Unknown config section: ${section}. Use 'apple' or 'google'.`);
  }

  saveConfig(config);
}

export function isAppleConfigured(config: StoreForgeConfig): boolean {
  return !!(config.apple.issuerId && config.apple.keyId && config.apple.privateKeyPath);
}

export function isGoogleConfigured(config: StoreForgeConfig): boolean {
  return !!(config.google.serviceAccountPath && config.google.packageName);
}
