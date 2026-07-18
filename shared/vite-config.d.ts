import type { UserConfig } from 'vite';
import type { MonkeyUserScript } from 'vite-plugin-monkey';

export interface MonkeyConfigOptions {
  name: string;
  entry?: string;
  userscript: MonkeyUserScript;
}

export function defineMonkeyConfig(options: MonkeyConfigOptions): UserConfig;
