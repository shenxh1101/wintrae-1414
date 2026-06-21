import { SDKConfig, DefaultScoringConfig } from './types';
import { CorrectionSDK, createSDK } from './sdk';

export class CorrectionSDKBuilder {
  private config: Partial<SDKConfig> = {};

  strictMode(enabled: boolean): CorrectionSDKBuilder {
    this.config.strictMode = enabled;
    return this;
  }

  similarityThreshold(threshold: number): CorrectionSDKBuilder {
    this.config.similarityThreshold = threshold;
    return this;
  }

  manualReviewSimilarityFloor(floor: number): CorrectionSDKBuilder {
    this.config.manualReviewSimilarityFloor = floor;
    return this;
  }

  defaultScoring(scoring: Partial<DefaultScoringConfig>): CorrectionSDKBuilder {
    const existing = this.config.defaultScoring ?? {};
    this.config.defaultScoring = { ...existing, ...scoring } as DefaultScoringConfig;
    return this;
  }

  build(): CorrectionSDK {
    return createSDK(this.config);
  }
}
