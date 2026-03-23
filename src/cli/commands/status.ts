import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig, isAppleConfigured, isGoogleConfigured } from '../../core/config.js';
import { getReviewStatus as getAppleReviewStatus, listApps } from '../../core/apple.js';
import { getReviewStatus as getGoogleReviewStatus } from '../../core/google.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Check app review/processing status on both stores')
    .option('--ios-app-id <id>', 'App Store Connect app ID')
    .action(async (options: { iosAppId?: string }) => {
      const config = loadConfig();
      let hasAnyConfig = false;

      // iOS status
      if (isAppleConfigured(config)) {
        hasAnyConfig = true;
        const spinner = ora('Checking App Store Connect status...').start();
        try {
          let appId = options.iosAppId;
          if (!appId) {
            const apps = await listApps(config.apple);
            if (apps.length === 0) {
              spinner.warn(chalk.yellow('No apps found in App Store Connect'));
            } else {
              appId = apps[0]!.id;
            }
          }

          if (appId) {
            const status = await getAppleReviewStatus(config.apple, appId);
            spinner.stop();
            console.log(chalk.bold.cyan('\n📱 App Store Connect'));
            console.log(chalk.white(`  Status:  ${formatStatus(status.status)}`));
            if (status.version) {
              console.log(chalk.white(`  Version: ${status.version}`));
            }
            if (status.lastUpdated) {
              console.log(chalk.gray(`  Updated: ${status.lastUpdated}`));
            }
          }
        } catch (error) {
          spinner.fail(chalk.red('Failed to check iOS status'));
          console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        }
      }

      // Android status
      if (isGoogleConfigured(config)) {
        hasAnyConfig = true;
        const spinner = ora('Checking Google Play status...').start();
        try {
          const status = await getGoogleReviewStatus(config.google);
          spinner.stop();
          console.log(chalk.bold.green('\n🤖 Google Play'));
          console.log(chalk.white(`  Status:  ${formatStatus(status.status)}`));
          if (status.version) {
            console.log(chalk.white(`  Version: ${status.version}`));
          }
          if (status.lastUpdated) {
            console.log(chalk.gray(`  Updated: ${status.lastUpdated}`));
          }
        } catch (error) {
          spinner.fail(chalk.red('Failed to check Android status'));
          console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        }
      }

      if (!hasAnyConfig) {
        console.log(chalk.yellow('\n⚠ No stores configured. Run: storeforge init'));
        process.exit(1);
      }

      console.log('');
    });
}

function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    READY_FOR_REVIEW: chalk.yellow('⏳ Ready for Review'),
    IN_REVIEW: chalk.blue('🔍 In Review'),
    WAITING_FOR_REVIEW: chalk.yellow('⏳ Waiting for Review'),
    APPROVED: chalk.green('✅ Approved'),
    REJECTED: chalk.red('❌ Rejected'),
    PREPARE_FOR_SUBMISSION: chalk.gray('📝 Preparing'),
    NO_ACTIVE_SUBMISSION: chalk.gray('— No active submission'),
    NO_ACTIVE_RELEASE: chalk.gray('— No active release'),
    completed: chalk.green('✅ Live'),
    inProgress: chalk.blue('🔄 Rolling out'),
    halted: chalk.red('⏸ Halted'),
    draft: chalk.gray('📝 Draft'),
  };

  return statusMap[status] || chalk.white(status);
}
