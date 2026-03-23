import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { loadConfig, isAppleConfigured, isGoogleConfigured } from '../../core/config.js';
import { submitForReview, listApps, listBuilds } from '../../core/apple.js';
import { promoteTrack, getTracks } from '../../core/google.js';

const ANDROID_TRACK_ORDER = ['internal', 'alpha', 'beta', 'production'];

export function registerReleaseCommand(program: Command): void {
  const release = program
    .command('release')
    .description('Promote builds from beta/testing to production');

  release
    .command('ios')
    .description('Submit for App Store review / promote to production')
    .option('--app-id <id>', 'App Store Connect app ID')
    .action(async (options: { appId?: string }) => {
      const config = loadConfig();

      if (!isAppleConfigured(config)) {
        console.error(chalk.red('✖ App Store Connect not configured. Run: storeforge init'));
        process.exit(1);
      }

      const spinner = ora('Fetching app information...').start();
      try {
        let appId = options.appId;
        if (!appId) {
          const apps = await listApps(config.apple);
          if (apps.length === 0) {
            spinner.fail(chalk.red('No apps found in App Store Connect'));
            process.exit(1);
          }

          spinner.stop();
          if (apps.length === 1) {
            appId = apps[0]!.id;
            console.log(chalk.gray(`Using app: ${apps[0]!.name} (${apps[0]!.bundleId})`));
          } else {
            const { selectedApp } = await inquirer.prompt<{ selectedApp: string }>([
              {
                type: 'list',
                name: 'selectedApp',
                message: 'Select an app:',
                choices: apps.map((a) => ({ name: `${a.name} (${a.bundleId})`, value: a.id })),
              },
            ]);
            appId = selectedApp;
          }
        }

        spinner.start('Fetching builds...');
        const builds = await listBuilds(config.apple, appId);
        spinner.stop();

        if (builds.length === 0) {
          console.log(chalk.yellow('No builds found. Upload a build first.'));
          process.exit(1);
        }

        console.log(chalk.bold.cyan('\nRecent Builds:'));
        builds.slice(0, 5).forEach((build, i) => {
          const state = build.processingState === 'VALID'
            ? chalk.green('✓')
            : chalk.yellow(build.processingState);
          console.log(`  ${i + 1}. v${build.version} (${build.buildNumber}) ${state}`);
        });

        const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'Submit latest valid build for App Store review?',
            default: false,
          },
        ]);

        if (confirm) {
          spinner.start('Submitting for review...');
          const validBuild = builds.find((b) => b.processingState === 'VALID');
          if (!validBuild) {
            spinner.fail(chalk.red('No valid builds available'));
            process.exit(1);
          }

          // Fetch editable version (not build ID)
          const { getHeaders: getAppleHeaders } = await import('../../core/apple.js');
          const headers = getAppleHeaders(config.apple);
          const versionResponse = await fetch(
            `https://api.appstoreconnect.apple.com/v1/apps/${appId}/appStoreVersions?filter[appStoreState]=PREPARE_FOR_SUBMISSION&limit=1`,
            { headers }
          );
          const versionData = await versionResponse.json() as any;
          if (!versionData.data?.length) {
            spinner.fail(chalk.red('No editable version found in PREPARE_FOR_SUBMISSION state'));
            process.exit(1);
          }
          const versionId = versionData.data[0].id;
          await submitForReview(config.apple, appId, versionId);
          spinner.succeed(chalk.green('Build submitted for App Store review!'));
        } else {
          console.log(chalk.gray('Cancelled.'));
        }
      } catch (error) {
        spinner.fail(chalk.red('Release failed'));
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  release
    .command('android [targetTrack]')
    .description('Promote Android build (internal→alpha→beta→production)')
    .action(async (targetTrack?: string) => {
      const config = loadConfig();

      if (!isGoogleConfigured(config)) {
        console.error(chalk.red('✖ Google Play not configured. Run: storeforge init'));
        process.exit(1);
      }

      const spinner = ora('Fetching track information...').start();
      try {
        const tracks = await getTracks(config.google);
        spinner.stop();

        if (tracks.length === 0) {
          console.log(chalk.yellow('No tracks found. Upload a build first.'));
          process.exit(1);
        }

        console.log(chalk.bold.green('\nCurrent Tracks:'));
        tracks.forEach((track) => {
          const releases = track.releases.map((r) =>
            `v${r.versionCodes?.[0] || '?'} (${r.status})`
          ).join(', ');
          console.log(`  ${track.track}: ${releases || chalk.gray('empty')}`);
        });

        // Determine source and target tracks
        let fromTrack: string | undefined;
        let toTrack: string;

        if (targetTrack) {
          toTrack = targetTrack;
          const targetIdx = ANDROID_TRACK_ORDER.indexOf(toTrack);
          if (targetIdx === -1) {
            console.error(chalk.red(`Invalid track: ${toTrack}. Valid tracks: ${ANDROID_TRACK_ORDER.join(', ')}`));
            process.exit(1);
          }
          if (targetIdx === 0) {
            console.error(chalk.red(`Cannot promote to ${toTrack} — it is the lowest track`));
            process.exit(1);
          }
          fromTrack = ANDROID_TRACK_ORDER[targetIdx - 1];
        } else {
          // Find the highest non-production track with releases
          for (let i = ANDROID_TRACK_ORDER.length - 2; i >= 0; i--) {
            const track = tracks.find((t) => t.track === ANDROID_TRACK_ORDER[i]);
            if (track && track.releases.length > 0) {
              fromTrack = ANDROID_TRACK_ORDER[i];
              toTrack = ANDROID_TRACK_ORDER[i + 1]!;
              break;
            }
          }

          if (!fromTrack) {
            console.error(chalk.red('No track found to promote from'));
            process.exit(1);
            return;
          }

          toTrack = ANDROID_TRACK_ORDER[ANDROID_TRACK_ORDER.indexOf(fromTrack) + 1]!;
        }

        const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Promote from ${chalk.cyan(fromTrack!)} → ${chalk.green(toTrack)}?`,
            default: false,
          },
        ]);

        if (confirm) {
          spinner.start(`Promoting ${fromTrack} → ${toTrack}...`);
          await promoteTrack(config.google, fromTrack!, toTrack);
          spinner.succeed(chalk.green(`Build promoted to ${toTrack}!`));
        } else {
          console.log(chalk.gray('Cancelled.'));
        }
      } catch (error) {
        spinner.fail(chalk.red('Release failed'));
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}
