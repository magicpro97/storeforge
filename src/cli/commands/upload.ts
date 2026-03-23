import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig, isAppleConfigured, isGoogleConfigured } from '../../core/config.js';
import { uploadIPA } from '../../core/apple.js';
import { uploadAAB } from '../../core/google.js';

export function registerUploadCommand(program: Command): void {
  const upload = program
    .command('upload')
    .description('Upload binaries to App Store Connect or Google Play');

  upload
    .command('ios <ipaPath>')
    .description('Upload IPA to App Store Connect / TestFlight')
    .action(async (ipaPath: string) => {
      const config = loadConfig();

      if (!isAppleConfigured(config)) {
        console.error(chalk.red('✖ App Store Connect not configured. Run: storeforge init'));
        process.exit(1);
      }

      const spinner = ora('Uploading IPA to App Store Connect...').start();

      try {
        const result = await uploadIPA(config.apple, ipaPath);
        if (result.success) {
          spinner.succeed(chalk.green(result.message));
        } else {
          spinner.fail(chalk.red(result.message));
          process.exit(1);
        }
      } catch (error) {
        spinner.fail(chalk.red('Upload failed'));
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  upload
    .command('android <aabPath>')
    .description('Upload AAB to Google Play')
    .option('-t, --track <track>', 'Target track (internal, alpha, beta, production)', 'internal')
    .action(async (aabPath: string, options: { track: string }) => {
      const config = loadConfig();

      if (!isGoogleConfigured(config)) {
        console.error(chalk.red('✖ Google Play not configured. Run: storeforge init'));
        process.exit(1);
      }

      const spinner = ora(`Uploading AAB to Google Play (${options.track} track)...`).start();

      try {
        const result = await uploadAAB(config.google, aabPath, options.track);
        if (result.success) {
          spinner.succeed(chalk.green(result.message));
          if (result.versionCode) {
            console.log(chalk.gray(`  Version code: ${result.versionCode}`));
          }
        } else {
          spinner.fail(chalk.red(result.message));
          process.exit(1);
        }
      } catch (error) {
        spinner.fail(chalk.red('Upload failed'));
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}
