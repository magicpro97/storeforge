import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { parse, stringify } from 'yaml';
import { loadConfig, isAppleConfigured, isGoogleConfigured } from '../../core/config.js';
import { getAppMetadata, updateAppMetadata, listApps } from '../../core/apple.js';
import { getStoreListing, updateStoreListing } from '../../core/google.js';
import type { MetadataFile, AppMetadata } from '../../types/index.js';

export function registerMetadataCommand(program: Command): void {
  const metadata = program
    .command('metadata')
    .description('Manage app metadata for both stores');

  metadata
    .command('sync <yamlPath>')
    .description('Sync metadata from local YAML to both stores')
    .option('--ios-app-id <id>', 'App Store Connect app ID')
    .option('--locale <locale>', 'Target locale', 'en-US')
    .action(async (yamlPath: string, options: { iosAppId?: string; locale: string }) => {
      if (!existsSync(yamlPath)) {
        console.error(chalk.red(`✖ YAML file not found: ${yamlPath}`));
        process.exit(1);
      }

      const config = loadConfig();
      const raw = readFileSync(yamlPath, 'utf-8');
      const metadataFile = parse(raw) as MetadataFile;

      // Sync iOS metadata
      if (metadataFile.ios && isAppleConfigured(config)) {
        const spinner = ora('Syncing iOS metadata to App Store Connect...').start();
        try {
          const locale = options.locale;
          const iosMetadata = metadataFile.ios[locale];

          if (!iosMetadata) {
            spinner.warn(chalk.yellow(`No iOS metadata found for locale: ${locale}`));
          } else {
            if (!options.iosAppId) {
              spinner.fail(chalk.red('iOS app ID is required. Use --ios-app-id'));
              process.exit(1);
            }
            await updateAppMetadata(config.apple, options.iosAppId, iosMetadata, locale);
            spinner.succeed(chalk.green(`iOS metadata synced for ${locale}`));
          }
        } catch (error) {
          spinner.fail(chalk.red('Failed to sync iOS metadata'));
          console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        }
      } else if (metadataFile.ios) {
        console.log(chalk.yellow('⚠ App Store Connect not configured, skipping iOS'));
      }

      // Sync Android metadata
      if (metadataFile.android && isGoogleConfigured(config)) {
        const spinner = ora('Syncing Android metadata to Google Play...').start();
        try {
          const locale = options.locale;
          const androidMetadata = metadataFile.android[locale];

          if (!androidMetadata) {
            spinner.warn(chalk.yellow(`No Android metadata found for locale: ${locale}`));
          } else {
            await updateStoreListing(config.google, androidMetadata, locale);
            spinner.succeed(chalk.green(`Android metadata synced for ${locale}`));
          }
        } catch (error) {
          spinner.fail(chalk.red('Failed to sync Android metadata'));
          console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        }
      } else if (metadataFile.android) {
        console.log(chalk.yellow('⚠ Google Play not configured, skipping Android'));
      }

      console.log(chalk.green('\n✓ Metadata sync complete'));
    });

  metadata
    .command('pull')
    .description('Pull current metadata from stores to local YAML')
    .option('-o, --output <path>', 'Output YAML path', 'metadata.yml')
    .option('--ios-app-id <id>', 'App Store Connect app ID')
    .option('--locale <locale>', 'Target locale', 'en-US')
    .action(async (options: { output: string; iosAppId?: string; locale: string }) => {
      const config = loadConfig();
      const metadataFile: MetadataFile = {};

      // Pull iOS metadata
      if (isAppleConfigured(config)) {
        const spinner = ora('Pulling iOS metadata from App Store Connect...').start();
        try {
          let appId = options.iosAppId;
          if (!appId) {
            const apps = await listApps(config.apple);
            if (apps.length === 0) {
              spinner.warn(chalk.yellow('No apps found in App Store Connect'));
            } else {
              appId = apps[0]!.id;
              spinner.text = `Pulling metadata for: ${apps[0]!.name}`;
            }
          }

          if (appId) {
            const iosMetadata = await getAppMetadata(config.apple, appId, options.locale);
            metadataFile.ios = { [options.locale]: iosMetadata };
            spinner.succeed(chalk.green('iOS metadata pulled'));
          }
        } catch (error) {
          spinner.fail(chalk.red('Failed to pull iOS metadata'));
          console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        }
      }

      // Pull Android metadata
      if (isGoogleConfigured(config)) {
        const spinner = ora('Pulling Android metadata from Google Play...').start();
        try {
          const androidMetadata = await getStoreListing(config.google, options.locale);
          metadataFile.android = { [options.locale]: androidMetadata };
          spinner.succeed(chalk.green('Android metadata pulled'));
        } catch (error) {
          spinner.fail(chalk.red('Failed to pull Android metadata'));
          console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        }
      }

      // Write YAML
      const yamlContent = stringify(metadataFile);
      writeFileSync(options.output, yamlContent, 'utf-8');
      console.log(chalk.green(`\n✓ Metadata saved to ${options.output}`));
    });
}
