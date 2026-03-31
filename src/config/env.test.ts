import { expect, test } from "bun:test";

import { appEnv, getAppEnv, loadAppEnv } from "./env";

const APP_ENV_KEYS = [
  "SMART_FEED_TIMEZONE",
  "SMART_FEED_TIME_WINDOW_HOURS",
  "SMART_FEED_DIGEST_TIMEZONE",
  "SMART_FEED_DIGEST_SEND_HOUR",
  "SMART_FEED_DIGEST_MAX_LOOKBACK_HOURS",
  "SMART_FEED_EMAIL_DELIVERY_ENABLED",
  "SMART_FEED_VALUE_SCORE_THRESHOLD",
  "SMART_FEED_AI_PROVIDER",
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
  "SMART_FEED_AI_BASIC_MODEL",
  "SMART_FEED_AI_HEAVY_MODEL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "SMTP_TO",
] as const;

function withEnv(overrides: Partial<Record<(typeof APP_ENV_KEYS)[number], string | undefined>>, run: () => void) {
  const previousValues = new Map<string, string | undefined>();

  for (const key of APP_ENV_KEYS) {
    previousValues.set(key, process.env[key]);
    const nextValue = overrides[key];

    if (nextValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = nextValue;
    }
  }

  try {
    run();
  } finally {
    for (const key of APP_ENV_KEYS) {
      const previousValue = previousValues.get(key);

      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }
}

test("loadAppEnv applies defaults and optional nulls", () => {
  withEnv({}, () => {
    const env = loadAppEnv();

    expect(env.timeZone).toBe("Asia/Shanghai");
    expect(env.timeWindowHours).toBe(72);
    expect(env.digestTimeZone).toBe("Asia/Shanghai");
    expect(env.digestSendHour).toBe(8);
    expect(env.digestMaxLookbackHours).toBe(48);
    expect(env.emailDeliveryEnabled).toBe(false);
    expect(env.valueScoreThreshold).toBe(6);
    expect(env.aiProvider).toBeNull();
    expect(env.openRouterApiKey).toBeNull();
    expect(env.openRouterBaseUrl).toBe("https://openrouter.ai/api/v1");
    expect(env.aiBasicModel).toBeNull();
    expect(env.aiHeavyModel).toBeNull();
    expect(env.smtpPort).toBeNull();
    expect(env.smtpHost).toBeNull();
  });
});

test("loadAppEnv reads explicit overrides and appEnv proxies them", () => {
  withEnv(
    {
      SMART_FEED_TIMEZONE: "America/New_York",
      SMART_FEED_TIME_WINDOW_HOURS: "24",
      SMART_FEED_DIGEST_TIMEZONE: "Europe/Berlin",
      SMART_FEED_DIGEST_SEND_HOUR: "6",
      SMART_FEED_DIGEST_MAX_LOOKBACK_HOURS: "12",
      SMART_FEED_EMAIL_DELIVERY_ENABLED: "true",
      SMART_FEED_VALUE_SCORE_THRESHOLD: "8",
      SMART_FEED_AI_PROVIDER: "openrouter",
      OPENROUTER_API_KEY: "test-key",
      OPENROUTER_BASE_URL: "https://openrouter.example.com/api/v1",
      SMART_FEED_AI_BASIC_MODEL: "openai/gpt-4o-mini",
      SMART_FEED_AI_HEAVY_MODEL: "openai/gpt-4o",
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "587",
      SMTP_USER: "user",
      SMTP_PASS: "pass",
      SMTP_FROM: "from@example.com",
      SMTP_TO: "to@example.com",
    },
    () => {
      const env = getAppEnv();

      expect(env.timeZone).toBe("America/New_York");
      expect(env.digestTimeZone).toBe("Europe/Berlin");
      expect(env.timeWindowHours).toBe(24);
      expect(env.digestSendHour).toBe(6);
      expect(env.digestMaxLookbackHours).toBe(12);
      expect(env.emailDeliveryEnabled).toBe(true);
      expect(env.valueScoreThreshold).toBe(8);
      expect(env.aiProvider).toBe("openrouter");
      expect(env.openRouterBaseUrl).toBe("https://openrouter.example.com/api/v1");
      expect(env.aiBasicModel).toBe("openai/gpt-4o-mini");
      expect(env.aiHeavyModel).toBe("openai/gpt-4o");
      expect(appEnv.smtpPort).toBe(587);
      expect(appEnv.smtpFrom).toBe("from@example.com");
      expect(appEnv.openRouterApiKey).toBe("test-key");
    },
  );
});

test("getAppEnv caches by env signature and refreshes after env changes", () => {
  withEnv(
    {
      SMART_FEED_TIMEZONE: "Asia/Shanghai",
      SMART_FEED_DIGEST_SEND_HOUR: "8",
    },
    () => {
      const first = getAppEnv();
      const second = getAppEnv();

      expect(first).toBe(second);
    },
  );

  withEnv(
    {
      SMART_FEED_TIMEZONE: "Asia/Tokyo",
      SMART_FEED_DIGEST_SEND_HOUR: "9",
    },
    () => {
      const refreshed = getAppEnv();

      expect(refreshed.timeZone).toBe("Asia/Tokyo");
      expect(refreshed.digestSendHour).toBe(9);
    },
  );
});

test("loadAppEnv falls back digest timezone to app timezone when unset", () => {
  withEnv(
    {
      SMART_FEED_TIMEZONE: "America/Los_Angeles",
      SMART_FEED_DIGEST_TIMEZONE: undefined,
    },
    () => {
      const env = loadAppEnv();
      expect(env.digestTimeZone).toBe("America/Los_Angeles");
    },
  );
});

test("loadAppEnv rejects invalid numeric and timezone values", () => {
  withEnv(
    {
      SMART_FEED_TIMEZONE: "Invalid/Timezone",
    },
    () => {
      expect(() => loadAppEnv()).toThrow("Invalid SMART_FEED_TIMEZONE timezone");
    },
  );

  withEnv(
    {
      SMART_FEED_DIGEST_SEND_HOUR: "24",
    },
    () => {
      expect(() => loadAppEnv()).toThrow("SMART_FEED_DIGEST_SEND_HOUR must be <= 23");
    },
  );

  withEnv(
    {
      SMART_FEED_VALUE_SCORE_THRESHOLD: "11",
    },
    () => {
      expect(() => loadAppEnv()).toThrow("SMART_FEED_VALUE_SCORE_THRESHOLD must be <= 10");
    },
  );

  withEnv(
    {
      SMART_FEED_AI_PROVIDER: "anthropic",
    },
    () => {
      expect(() => loadAppEnv()).toThrow('SMART_FEED_AI_PROVIDER must be one of "openrouter" or "dummy"');
    },
  );

  withEnv(
    {
      SMART_FEED_EMAIL_DELIVERY_ENABLED: "true",
      SMTP_HOST: undefined,
      SMTP_PORT: "587",
      SMTP_USER: "user",
      SMTP_PASS: "pass",
      SMTP_FROM: "from@example.com",
      SMTP_TO: "to@example.com",
    },
    () => {
      expect(() => loadAppEnv()).toThrow("SMTP_HOST is required when SMART_FEED_EMAIL_DELIVERY_ENABLED is true.");
    },
  );

  withEnv(
    {
      SMART_FEED_EMAIL_DELIVERY_ENABLED: "true",
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: undefined,
      SMTP_USER: "user",
      SMTP_PASS: "pass",
      SMTP_FROM: "from@example.com",
      SMTP_TO: "to@example.com",
    },
    () => {
      expect(() => loadAppEnv()).toThrow("SMTP_PORT is required when SMART_FEED_EMAIL_DELIVERY_ENABLED is true.");
    },
  );

  withEnv(
    {
      SMART_FEED_EMAIL_DELIVERY_ENABLED: "enabled",
    },
    () => {
      expect(() => loadAppEnv()).toThrow("SMART_FEED_EMAIL_DELIVERY_ENABLED must be a boolean");
    },
  );
});
