import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, extname } from 'path';

interface PreflightResult {
  name: string;
  passed: boolean;
  details: string;
}

const PLACEHOLDER_PATTERNS = [
  /lorem ipsum/i,
  /\bTODO\b/,
  /\bFIXME\b/,
  /\bplaceholder\b/i,
];

const REQUIRED_METADATA_FIELDS = ['title', 'description', 'keywords'];

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function parseYaml(content: string): Record<string, unknown> {
  // Simple YAML parser for flat/nested key-value pairs
  const result: Record<string, unknown> = {};
  const lines = content.split('\n');
  let currentKey = '';

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;
    const keyMatch = trimmed.match(/^(\w[\w\s]*?):\s*(.*)$/);

    if (keyMatch) {
      const key = keyMatch[1]!.trim();
      const value = keyMatch[2]!.trim();

      if (indent === 0) {
        currentKey = key;
        if (value) {
          result[key] = value;
        } else {
          result[key] = {};
        }
      } else if (currentKey) {
        const parent = result[currentKey];
        if (typeof parent === 'object' && parent !== null) {
          (parent as Record<string, unknown>)[key] = value || true;
        }
      }
    } else if (trimmed.startsWith('- ') && currentKey) {
      const val = trimmed.slice(2).trim();
      if (!Array.isArray(result[currentKey])) {
        result[currentKey] = [];
      }
      (result[currentKey] as string[]).push(val);
    }
  }

  return result;
}

function checkMetadata(metadataPath: string): PreflightResult {
  if (!existsSync(metadataPath)) {
    return { name: 'Metadata file', passed: false, details: `${metadataPath} not found` };
  }

  const content = readFileSync(metadataPath, 'utf-8');
  const data = parseYaml(content);

  const missing = REQUIRED_METADATA_FIELDS.filter((field) => !data[field]);
  if (missing.length > 0) {
    return {
      name: 'Metadata fields',
      passed: false,
      details: `Missing required fields: ${missing.join(', ')}`,
    };
  }

  return { name: 'Metadata fields', passed: true, details: 'All required fields present (title, description, keywords)' };
}

function checkScreenshots(screenshotsDir: string): PreflightResult {
  if (!existsSync(screenshotsDir)) {
    return { name: 'Screenshots', passed: false, details: `Directory not found: ${screenshotsDir}` };
  }

  const stat = statSync(screenshotsDir);
  if (!stat.isDirectory()) {
    return { name: 'Screenshots', passed: false, details: `Not a directory: ${screenshotsDir}` };
  }

  let totalImages = 0;
  const subdirs: string[] = [];

  const entries = readdirSync(screenshotsDir);
  for (const entry of entries) {
    const fullPath = join(screenshotsDir, entry);
    const entryStat = statSync(fullPath);

    if (entryStat.isDirectory()) {
      subdirs.push(entry);
      const files = readdirSync(fullPath);
      totalImages += files.filter((f) => IMAGE_EXTENSIONS.has(extname(f).toLowerCase())).length;
    } else if (IMAGE_EXTENSIONS.has(extname(entry).toLowerCase())) {
      totalImages++;
    }
  }

  if (totalImages === 0) {
    return { name: 'Screenshots', passed: false, details: 'No image files found in screenshots directory' };
  }

  const dirsInfo = subdirs.length > 0 ? ` across ${subdirs.length} size(s)` : '';
  return { name: 'Screenshots', passed: true, details: `${totalImages} images found${dirsInfo}` };
}

function checkIcon(iconPath: string | undefined, screenshotsDir: string): PreflightResult {
  const candidates = iconPath
    ? [iconPath]
    : [
        join(screenshotsDir, 'icon.png'),
        join(screenshotsDir, 'icon-1024.png'),
        join(screenshotsDir, 'app-icon.png'),
        'icon.png',
        'app-icon.png',
        'assets/icon.png',
      ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return { name: 'App icon', passed: true, details: `Found: ${candidate}` };
    }
  }

  return {
    name: 'App icon',
    passed: false,
    details: 'No app icon found. Expected 1024x1024 (iOS) or 512x512 (Android)',
  };
}

function checkPlaceholderText(metadataPath: string): PreflightResult {
  if (!existsSync(metadataPath)) {
    return { name: 'Placeholder text', passed: true, details: 'No metadata file to check' };
  }

  const content = readFileSync(metadataPath, 'utf-8');
  const found: string[] = [];

  for (const pattern of PLACEHOLDER_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      found.push(match[0]);
    }
  }

  if (found.length > 0) {
    return {
      name: 'Placeholder text',
      passed: false,
      details: `Found placeholder text: ${found.join(', ')}`,
    };
  }

  return { name: 'Placeholder text', passed: true, details: 'No placeholder text detected' };
}

function checkVersion(metadataPath: string): PreflightResult {
  if (!existsSync(metadataPath)) {
    return { name: 'Version', passed: true, details: 'No metadata file to check' };
  }

  const content = readFileSync(metadataPath, 'utf-8');
  const data = parseYaml(content);

  if (!data.version) {
    return { name: 'Version', passed: false, details: 'No version field in metadata' };
  }

  const version = String(data.version);
  const semverMatch = /^\d+\.\d+(\.\d+)?$/.test(version);
  if (!semverMatch) {
    return { name: 'Version', passed: false, details: `Invalid version format: "${version}" (expected X.Y.Z)` };
  }

  return { name: 'Version', passed: true, details: `Version: ${version}` };
}

function checkLocales(metadataPath: string): PreflightResult {
  if (!existsSync(metadataPath)) {
    return { name: 'Locales', passed: true, details: 'No metadata file to check' };
  }

  const content = readFileSync(metadataPath, 'utf-8');
  const data = parseYaml(content);

  if (data.locales && typeof data.locales === 'object') {
    const locales = Object.keys(data.locales as Record<string, unknown>);
    if (locales.length > 0) {
      return { name: 'Locales', passed: true, details: `${locales.length} locale(s): ${locales.join(', ')}` };
    }
  }

  // Check if there's at least a default locale indicator
  if (data.locale) {
    return { name: 'Locales', passed: true, details: `Default locale: ${data.locale}` };
  }

  return { name: 'Locales', passed: true, details: 'Single locale (default)' };
}

export function registerPreflightCommand(program: Command): void {
  program
    .command('preflight')
    .description('Pre-release checklist — verify metadata, assets, and readiness')
    .option('--metadata <path>', 'Path to metadata YAML file', './metadata.yml')
    .option('--screenshots <dir>', 'Path to screenshots/assets directory', './store-assets/')
    .option('--icon <path>', 'Path to app icon file')
    .action(async (options: { metadata: string; screenshots: string; icon?: string }) => {
      const metadataPath = resolve(options.metadata);
      const screenshotsDir = resolve(options.screenshots);

      console.log(chalk.bold.cyan('\n🔍 Pre-Release Checklist\n'));

      const results: PreflightResult[] = [
        checkMetadata(metadataPath),
        checkScreenshots(screenshotsDir),
        checkIcon(options.icon, screenshotsDir),
        checkPlaceholderText(metadataPath),
        checkVersion(metadataPath),
        checkLocales(metadataPath),
      ];

      for (const result of results) {
        const icon = result.passed ? chalk.green('✅') : chalk.red('❌');
        const label = result.passed ? chalk.white(result.name) : chalk.red(result.name);
        console.log(`  ${icon} ${label}: ${chalk.gray(result.details)}`);
      }

      const failures = results.filter((r) => !r.passed);
      console.log();

      if (failures.length === 0) {
        console.log(chalk.bold.green('🚀 Ready for release!'));
      } else {
        console.log(chalk.bold.red(`❌ ${failures.length} issue${failures.length > 1 ? 's' : ''} must be fixed before release`));
        process.exit(1);
      }
    });
}
