export class AiProviderUnavailableError extends Error {
  readonly code = "AI_PROVIDER_UNAVAILABLE";

  constructor(
    message = "[ai/client] AI provider is not configured. Set SMART_FEED_AI_PROVIDER before running AI stages.",
  ) {
    super(message);
    this.name = "AiProviderUnavailableError";
  }
}

export class AiConfigurationError extends Error {
  readonly code = "AI_CONFIGURATION_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "AiConfigurationError";
  }
}
