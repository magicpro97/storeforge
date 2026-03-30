import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import { loadConfig, isAppleConfigured, isGoogleConfigured } from '../../core/config.js';
import { submitForReview, listApps, listBuilds } from '../../core/apple.js';
import { promoteTrack, getTracks } from '../../core/google.js';
import type { PromoteOptions } from '../../core/google.js';

const ANDROID_TRACK_ORDER = ['internal', 'alpha', 'beta', 'production'];

function formatCommitAsReleaseNote(commit: string): string | null {
  const trimmed = commit.replace(/^[a-f0-9]+\s+/, '').trim();

  if (/^Merge /i.test(trimmed)) return null;

  const conventionalMatch = trimmed.match(/^(\w+)(?:\(.+?\))?!?:\s*(.+)$/);
  if (!conventionalMatch) {
    return `• ${capitalize(trimmed)}`;
  }

  const type = conventionalMatch[1]!.toLowerCase();
  const message = conventionalMatch[2]!.trim();

  switch (type) {
    case 'feat':
      return `✨ New: You can now ${lowerFirst(message)}`;
    case 'fix':
      return `🐛 Fixed: ${capitalize(message)} resolved`;
    case 'perf':
      return `⚡ Improved: ${capitalize(message)}`;
    case 'refactor':
      return `♻️ Improved: ${capitalize(message)}`;
    case 'style':
      return `🎨 Improved: ${capitalize(message)}`;
    case 'chore':
    case 'ci':
    case 'test':
    case 'docs':
    case 'build':
      return null;
    default:
      return `• ${capitalize(message)}`;
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function generateReleaseNotes(): string[] {
  let gitLog: string;
  try {
    // Try from last tag to HEAD
    const lastTag = execSync('git describe --tags --abbrev=0 2>/dev/null', { encoding: 'utf-8' }).trim();
    gitLog = execSync(`git log --oneline ${lastTag}..HEAD`, { encoding: 'utf-8' }).trim();
  } catch {
    // No tags — use last 20 commits
    gitLog = execSync('git log --oneline -20', { encoding: 'utf-8' }).trim();
  }

  if (!gitLog) return [];

  const lines = gitLog.split('\n').filter(Boolean);
  const notes: string[] = [];

  for (const line of lines) {
    const note = formatCommitAsReleaseNote(line);
    if (note) notes.push(note);
  }

  return notes;
}

export function registerReleaseCommand(program: Command): void {
  const release = program
    .command('release')
    .description('Promote builds from beta/testing to production');

  release
    .command('ios')
    .description('Submit for App Store review / promote to production')
    .option('--app-id <id>', 'App Store Connect app ID')
    .option('--notes-from-git', 'Auto-generate release notes from git history')
    .action(async (options: { appId?: string; notesFromGit?: boolean }) => {
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
    .option('--phased', 'Use phased rollout (1% → 5% → 20% → 50% → 100%)')
    .option('--fraction <percent>', 'Set custom user fraction (0.01 to 1.0)', parseFloat)
    .option('--notes-from-git', 'Auto-generate release notes from git history')
    .action(async (targetTrack: string | undefined, options: { phased?: boolean; fraction?: number; notesFromGit?: boolean }) => {
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

        // Validate fraction option
        if (options.fraction != null) {
          if (options.fraction < 0.01 || options.fraction > 1.0) {
            console.error(chalk.red('--fraction must be between 0.01 and 1.0'));
            process.exit(1);
          }
        }

        // Determine user fraction
        const userFraction = options.fraction ?? (options.phased ? 0.01 : undefined);

        // Generate release notes from git if requested
        let releaseNotes: { language: string; text: string }[] | undefined;
        if (options.notesFromGit) {
          console.log(chalk.bold.cyan('\n📝 Generating release notes from git history...\n'));
          const notes = generateReleaseNotes();
          if (notes.length === 0) {
            console.log(chalk.yellow('No commits found to generate notes from.'));
          } else {
            const notesText = notes.join('\n');
            console.log(chalk.white(notesText));
            console.log();

            const { useNotes } = await inquirer.prompt<{ useNotes: boolean }>([
              {
                type: 'confirm',
                name: 'useNotes',
                message: 'Use these release notes?',
                default: true,
              },
            ]);

            if (useNotes) {
              releaseNotes = [{ language: 'en-US', text: notesText }];
            }
          }
        }

        const fractionLabel = userFraction != null ? ` (${Math.round(userFraction * 100)}% rollout)` : '';
        const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Promote from ${chalk.cyan(fromTrack!)} → ${chalk.green(toTrack)}${fractionLabel}?`,
            default: false,
          },
        ]);

        if (confirm) {
          const promoteOptions: PromoteOptions = {};
          if (userFraction != null) {
            promoteOptions.userFraction = userFraction;
          }
          if (releaseNotes) {
            promoteOptions.releaseNotes = releaseNotes;
          }

          spinner.start(`Promoting ${fromTrack} → ${toTrack}...`);
          await promoteTrack(config.google, fromTrack!, toTrack, promoteOptions);
          spinner.succeed(chalk.green(`Build promoted to ${toTrack}!`));

          if (options.phased) {
            console.log(chalk.bold.cyan('\n📊 Phased Rollout Plan:'));
            console.log(`  Stage 1: 1% of users ${chalk.green('(current)')}`);
            console.log(`  Stage 2: 5% (promote with: ${chalk.gray(`storeforge release android ${toTrack} --fraction 0.05`)})`);
            console.log('  Stage 3: 20%');
            console.log('  Stage 4: 50%');
            console.log('  Stage 5: 100% (full release)');
            console.log(chalk.yellow('\n💡 Monitor crash rate between stages with: monforge status'));
          } else if (userFraction != null && userFraction < 1.0) {
            console.log(chalk.cyan(`\n📊 Rolling out to ${Math.round(userFraction * 100)}% of users`));
            console.log(chalk.yellow('💡 Monitor crash rate with: monforge status'));
          }
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
