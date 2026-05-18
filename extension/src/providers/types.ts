import type { ClassificationInput, ClassificationResult, SummaryInput, SummaryResult } from "../models/classification.js";
import type { ProviderConfig } from "../background/storage.js";

export type ProviderErrorCode = "invalid_config" | "auth_failed" | "rate_limited" | "timeout" | "network_error" | "unsupported_model" | "invalid_response" | "schema_validation_failed" | "provider_unavailable";

export interface ProviderFailure {
  ok: false;
  code: ProviderErrorCode;
  message: string;
  retryable: boolean;
  statusCode?: number;
}

export interface ProviderSuccess<T> {
  ok: true;
  value: T;
  rawUsage?: { inputTokens?: number; outputTokens?: number };
}

export type ProviderResult<T> = ProviderSuccess<T> | ProviderFailure;

export interface AIProvider {
  id: string;
  name: string;
  validateConfig(config: ProviderConfig): Promise<ProviderResult<{ model: string }>>;
  classifyBookmark(input: ClassificationInput): Promise<ProviderResult<ClassificationResult>>;
  summarizeBookmark(input: SummaryInput): Promise<ProviderResult<SummaryResult>>;
}
