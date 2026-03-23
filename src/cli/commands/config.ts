import { Command } from 'commander';
import chalk from 'chalk';
import { getConfigValue, setConfigValue, loadConfig, getConfigPath } from '../../core/config.js';

export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command('config')
    .description('Manage StoreForge credentials and configuration');

  configCmd
    .command('set <key> <value>')
    .description('Set a configuration value (e.g., apple.keyId, google.packageName)')
    .action((key: string, value: string) => {
      try {
        setConfigValue(key, value);
        console.log(chalk.green(`✓ Set ${chalk.bold(key)} = ${value}`));
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  configCmd
    .command('get <key>')
    .description('Get a configuration value')
    .action((key: string) => {
      const value = getConfigValue(key);
      if (value !== undefined) {
        console.log(value);
      } else {
        console.error(chalk.red(`Config key not found: ${key}`));
        process.exit(1);
      }
    });

  configCmd
    .command('list')
    .description('Show current configuration')
    .action(() => {
      const config = loadConfig();

      console.log(chalk.bold.cyan('\n🔧 StoreForge Configuration'));
      console.log(chalk.gray(`Config file: ${getConfigPath()}\n`));

      console.log(chalk.bold.yellow('📱 App Store Connect'));
      console.log(`  Issuer ID:        ${maskValue(config.apple.issuerId)}`);
      console.log(`  Key ID:           ${maskValue(config.apple.keyId)}`);
      console.log(`  Private Key Path: ${config.apple.privateKeyPath || chalk.gray('(not set)')}`);

      console.log(chalk.bold.green('\n🤖 Google Play'));
      console.log(`  Service Account:  ${config.google.serviceAccountPath || chalk.gray('(not set)')}`);
      console.log(`  Package Name:     ${config.google.packageName || chalk.gray('(not set)')}`);

      console.log('');
    });
}

function maskValue(value: string): string {
  if (!value) return chalk.gray('(not set)');
  if (value.length <= 8) return '****' + value.slice(-4);
  return '****' + value.slice(-6);
}
