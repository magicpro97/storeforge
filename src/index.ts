#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { registerInitCommand } from './cli/commands/init.js';
import { registerUploadCommand } from './cli/commands/upload.js';
import { registerMetadataCommand } from './cli/commands/metadata.js';
import { registerStatusCommand } from './cli/commands/status.js';
import { registerReleaseCommand } from './cli/commands/release.js';
import { registerConfigCommand } from './cli/commands/config.js';
import { registerPreflightCommand } from './cli/commands/preflight.js';

const program = new Command();

program
  .name('storeforge')
  .description('🚀 Unified App Store Deployment CLI — iOS App Store & Google Play from your terminal')
  .version('1.0.0');

// Register all commands
registerInitCommand(program);
registerUploadCommand(program);
registerMetadataCommand(program);
registerStatusCommand(program);
registerReleaseCommand(program);
registerConfigCommand(program);
registerPreflightCommand(program);

// Custom help footer
program.addHelpText('after', `
${chalk.bold('Examples:')}
  ${chalk.gray('# Setup credentials')}
  $ storeforge init

  ${chalk.gray('# Upload binaries')}
  $ storeforge upload ios ./build/MyApp.ipa
  $ storeforge upload android ./build/app-release.aab

  ${chalk.gray('# Sync metadata from YAML')}
  $ storeforge metadata sync metadata.yml
  $ storeforge metadata pull -o metadata.yml

  ${chalk.gray('# Check review status')}
  $ storeforge status

  ${chalk.gray('# Release to production')}
  $ storeforge release ios
  $ storeforge release android production
  $ storeforge release android production --phased
  $ storeforge release android production --fraction 0.05
  $ storeforge release android production --notes-from-git

  ${chalk.gray('# Pre-release checklist')}
  $ storeforge preflight
  $ storeforge preflight --metadata ./metadata.yml --screenshots ./assets/

  ${chalk.gray('# Manage configuration')}
  $ storeforge config list
  $ storeforge config set google.packageName com.example.app

${chalk.bold('Documentation:')} ${chalk.cyan('https://github.com/magicpro97/storeforge#readme')}
`);

program.parse();
