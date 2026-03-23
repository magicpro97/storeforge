export interface StoreForgeConfig {
  apple: AppleConfig;
  google: GoogleConfig;
}

export interface AppleConfig {
  issuerId: string;
  keyId: string;
  privateKeyPath: string;
}

export interface GoogleConfig {
  serviceAccountPath: string;
  packageName: string;
}

export interface AppMetadata {
  title: string;
  subtitle?: string;
  description: string;
  shortDescription?: string;
  keywords?: string[];
  whatsNew?: string;
  screenshots?: ScreenshotSet;
  locale?: string;
}

export interface ScreenshotSet {
  iphone55?: string[];
  iphone65?: string[];
  iphone67?: string[];
  ipad?: string[];
  android_phone?: string[];
  android_tablet?: string[];
  android_tv?: string[];
}

export interface MetadataFile {
  ios?: Record<string, AppMetadata>;
  android?: Record<string, AppMetadata>;
}

export interface AppleBuild {
  id: string;
  version: string;
  buildNumber: string;
  processingState: string;
  uploadedDate: string;
  expirationDate?: string;
}

export interface GoogleTrack {
  track: string;
  releases: GoogleRelease[];
}

export interface GoogleRelease {
  name?: string;
  versionCodes: string[];
  status: string;
  userFraction?: number;
  releaseNotes?: { language: string; text: string }[];
}

export interface UploadResult {
  success: boolean;
  platform: 'ios' | 'android';
  message: string;
  buildId?: string;
  versionCode?: string;
}

export interface ReviewStatus {
  platform: 'ios' | 'android';
  status: string;
  version?: string;
  lastUpdated?: string;
}
