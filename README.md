# StoreForge

> 🚀 Unified App Store Deployment CLI — iOS App Store & Google Play from your terminal

[![npm version](https://img.shields.io/npm/v/storeforge.svg)](https://www.npmjs.com/package/storeforge)
[![CI](https://github.com/magicpro97/storeforge/actions/workflows/ci.yml/badge.svg)](https://github.com/magicpro97/storeforge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)

One CLI to **upload builds**, **sync metadata**, **check review status**, and **release to production** on both iOS App Store and Google Play.

## Install

```bash
npm install -g storeforge
```

## Quick Start

```bash
# 1. Setup credentials
storeforge init

# 2. Upload your build
storeforge upload ios ./build/MyApp.ipa
storeforge upload android ./build/app-release.aab

# 3. Check status
storeforge status

# 4. Release to production
storeforge release ios
storeforge release android production
```

## Commands

### `storeforge init`

Interactive setup wizard to configure App Store Connect and Google Play credentials.

```bash
storeforge init
```

### `storeforge upload`

Upload binaries to app stores.

```bash
# Upload IPA to App Store Connect / TestFlight
storeforge upload ios <ipa-path>

# Upload AAB to Google Play (default: internal track)
storeforge upload android <aab-path>
storeforge upload android <aab-path> --track beta
storeforge upload android <aab-path> --track production
```

**Options:**
- `-t, --track <track>` — Target track for Android: `internal`, `alpha`, `beta`, `production` (default: `internal`)

### `storeforge metadata`

Manage app metadata across both stores using YAML files.

```bash
# Sync local YAML to both stores
storeforge metadata sync metadata.yml
storeforge metadata sync metadata.yml --locale ja

# Pull current metadata from stores
storeforge metadata pull
storeforge metadata pull -o my-metadata.yml
```

**Options:**
- `--ios-app-id <id>` — App Store Connect app ID
- `--locale <locale>` — Target locale (default: `en-US`)
- `-o, --output <path>` — Output path for pull (default: `metadata.yml`)

### `storeforge status`

Check app review and processing status on both stores.

```bash
storeforge status
storeforge status --ios-app-id 1234567890
```

### `storeforge release`

Promote builds from testing to production.

```bash
# iOS: Submit for App Store review
storeforge release ios
storeforge release ios --app-id 1234567890

# Android: Promote build through tracks
storeforge release android              # Auto-detect next track
storeforge release android production   # Promote to production
storeforge release android beta         # Promote to beta
```

### `storeforge config`

Manage credentials and configuration.

```bash
# Show current config
storeforge config list

# Set individual values
storeforge config set apple.keyId YOUR_KEY_ID
storeforge config set apple.issuerId YOUR_ISSUER_ID
storeforge config set apple.privateKeyPath /path/to/AuthKey.p8
storeforge config set google.serviceAccountPath /path/to/service-account.json
storeforge config set google.packageName com.example.myapp

# Get a value
storeforge config get google.packageName
```

## App Store Connect Setup

1. Go to [App Store Connect → Users and Access → Keys](https://appstoreconnect.apple.com/access/api)
2. Click **Generate API Key**
3. Select the **Admin** or **App Manager** role
4. Download the `.p8` private key file (you can only download it once!)
5. Note your **Issuer ID** and **Key ID**

```bash
storeforge config set apple.issuerId "your-issuer-id"
storeforge config set apple.keyId "your-key-id"
storeforge config set apple.privateKeyPath "/path/to/AuthKey_XXXXX.p8"
```

## Google Play Setup

1. Go to [Google Cloud Console → IAM & Admin → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Create a new service account (or use existing)
3. Grant it the **Service Account User** role
4. Create a JSON key and download it
5. Go to [Google Play Console → Settings → API Access](https://play.google.com/console)
6. Link the service account and grant **Release Manager** permission

```bash
storeforge config set google.serviceAccountPath "/path/to/service-account.json"
storeforge config set google.packageName "com.example.myapp"
```

## Metadata YAML Format

Store your app metadata in a version-controlled YAML file:

```yaml
ios:
  en-US:
    title: "My Awesome App"
    subtitle: "Do amazing things"
    description: |
      My Awesome App helps you do amazing things.

      Features:
      - Feature one
      - Feature two
      - Feature three
    keywords:
      - awesome
      - productivity
      - tools
    whatsNew: |
      - Bug fixes and performance improvements
      - New feature X

android:
  en-US:
    title: "My Awesome App"
    shortDescription: "Do amazing things with one tap"
    description: |
      My Awesome App helps you do amazing things.

      Features:
      ★ Feature one
      ★ Feature two
      ★ Feature three
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Deploy to Stores
on:
  release:
    types: [published]

jobs:
  deploy:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install StoreForge
        run: npm install -g storeforge

      - name: Configure credentials
        run: |
          storeforge config set apple.issuerId "${{ secrets.ASC_ISSUER_ID }}"
          storeforge config set apple.keyId "${{ secrets.ASC_KEY_ID }}"
          echo "${{ secrets.ASC_PRIVATE_KEY }}" > /tmp/AuthKey.p8
          storeforge config set apple.privateKeyPath /tmp/AuthKey.p8
          echo '${{ secrets.GOOGLE_SERVICE_ACCOUNT }}' > /tmp/sa.json
          storeforge config set google.serviceAccountPath /tmp/sa.json
          storeforge config set google.packageName com.example.myapp

      - name: Upload iOS
        run: storeforge upload ios ./build/MyApp.ipa

      - name: Upload Android
        run: storeforge upload android ./build/app-release.aab --track beta

      - name: Sync metadata
        run: storeforge metadata sync metadata.yml

      - name: Check status
        run: storeforge status
```

## Configuration

Configuration is stored at `~/.storeforge/config.json`:

```json
{
  "apple": {
    "issuerId": "your-issuer-id",
    "keyId": "your-key-id",
    "privateKeyPath": "/path/to/AuthKey.p8"
  },
  "google": {
    "serviceAccountPath": "/path/to/service-account.json",
    "packageName": "com.example.myapp"
  }
}
```

## Requirements

- Node.js 20+
- App Store Connect API key (for iOS commands)
- Google Play service account (for Android commands)

## License

MIT © [magicpro97](https://github.com/magicpro97)
