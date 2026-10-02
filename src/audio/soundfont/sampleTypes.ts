export interface SampleRegion {
  bank: number;
  program: number;
  low: number;
  high: number;
  velocityLow: number;
  velocityHigh: number;
  sample: number;
}
export interface SampleAsset {
  file: string;
  compressed: boolean;
  sampleRate: number;
  frames: number;
  loopStart: number;
  loopEnd: number;
}
export interface SampleManifest {
  template: string;
  samples: SampleAsset[];
  regions: SampleRegion[];
}
export interface LoadedSample extends SampleAsset {
  bytes: Uint8Array;
}
