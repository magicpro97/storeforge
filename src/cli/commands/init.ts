import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { saveConfig, getDefaultConfig, getConfigPath } from '../../core/config.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Setup StoreForge credentials (App Store Connect & Google Play)')
    .action(async () => {
      console.log(chalk.bold.cyan('\n🚀 StoreForge Setup\n'));
      console.log(chalk.gray(`Config will be saved to: ${getConfigPath()}\n`));

      const config = getDefaultConfig();

      const { setupApple } = await inquirer.prompt<{ setupApple: boolean }>([
        {
          type: 'confirm',
          name: 'setupApple',
          message: 'Configure App Store Connect (iOS)?',
          default: true,
        },
      ]);

      if (setupApple) {
        console.log(chalk.yellow('\n📱 App Store Connect Setup'));
        console.log(chalk.gray('Get your API key from: https://appstoreconnect.apple.com/access/api\n'));

        const appleAnswers = await inquirer.prompt<{
          issuerId: string;
          keyId: string;
          privateKeyPath: string;
        }>([
          {
            type: 'input',
            name: 'issuerId',
            message: 'Issuer ID:',
            validate: (v: string) => v.length > 0 || 'Issuer ID is required',
          },
          {
            type: 'input',
            name: 'keyId',
            message: 'Key ID:',
            validate: (v: string) => v.length > 0 || 'Key ID is required',
          },
          {
            type: 'input',
            name: 'privateKeyPath',
            message: 'Path to .p8 private key file:',
            validate: (v: string) => v.length > 0 || 'Private key path is required',
          },
        ]);

        config.apple = appleAnswers;
      }

      const { setupGoogle } = await inquirer.prompt<{ setupGoogle: boolean }>([
        {
          type: 'confirm',
          name: 'setupGoogle',
          message: 'Configure Google Play (Android)?',
          default: true,
        },
      ]);

      if (setupGoogle) {
        console.log(chalk.yellow('\n🤖 Google Play Setup'));
        console.log(chalk.gray('Create a service account at: https://console.cloud.google.com/iam-admin/serviceaccounts\n'));

        const googleAnswers = await inquirer.prompt<{
          serviceAccountPath: string;
          packageName: string;
        }>([
          {
            type: 'input',
            name: 'serviceAccountPath',
            message: 'Path to service account JSON:',
            validate: (v: string) => v.length > 0 || 'Service account path is required',
          },
          {
            type: 'input',
            name: 'packageName',
            message: 'Package name (e.g., com.example.app):',
            validate: (v: string) => v.length > 0 || 'Package name is required',
          },
        ]);

        config.google = googleAnswers;
      }

      const spinner = ora('Saving configuration...').start();
      try {
        saveConfig(config);
        spinner.succeed(chalk.green('Configuration saved!'));
        console.log(chalk.gray(`\nConfig file: ${getConfigPath()}`));
        console.log(chalk.cyan('\nNext steps:'));
        console.log(chalk.white('  storeforge upload ios <ipa-path>      Upload an IPA'));
        console.log(chalk.white('  storeforge upload android <aab-path>  Upload an AAB'));
        console.log(chalk.white('  storeforge status                     Check review status'));
      } catch (error) {
        spinner.fail(chalk.red('Failed to save configuration'));
        console.error(error);
        process.exit(1);
      }
    });
}
