import { describe, it, expect, beforeEach, afterEach } from "vitest"; // vi not needed yet
import { loadConfigFromEnv } from "./auth.js";

describe("loadConfigFromEnv", () => {
  const saved: Record<string, string | undefined> = {};
  const envKeys = [
    "ATLASSIAN_URL", "ATLASSIAN_EMAIL", "ATLASSIAN_TOKEN",
    "CONFLUENCE_URL", "CONFLUENCE_EMAIL", "CONFLUENCE_TOKEN",
  ];

  beforeEach(() => {
    for (const key of envKeys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (saved[key] !== undefined) {
        process.env[key] = saved[key];
      } else {
        delete process.env[key];
      }
    }
  });

  it("reads ATLASSIAN_* variables", () => {
    process.env.ATLASSIAN_URL = "https://test.atlassian.net";
    process.env.ATLASSIAN_EMAIL = "a@b.com";
    process.env.ATLASSIAN_TOKEN = "tok";

    const config = loadConfigFromEnv();
    expect(config.baseUrl).toBe("https://test.atlassian.net");
    expect(config.email).toBe("a@b.com");
    expect(config.token).toBe("tok");
  });

  it("falls back to CONFLUENCE_* variables", () => {
    process.env.CONFLUENCE_URL = "https://test.atlassian.net/wiki";
    process.env.CONFLUENCE_EMAIL = "c@d.com";
    process.env.CONFLUENCE_TOKEN = "tok2";

    const config = loadConfigFromEnv();
    expect(config.email).toBe("c@d.com");
    expect(config.token).toBe("tok2");
  });

  it("strips /wiki from CONFLUENCE_URL", () => {
    process.env.CONFLUENCE_URL = "https://test.atlassian.net/wiki";
    process.env.CONFLUENCE_EMAIL = "a@b.com";
    process.env.CONFLUENCE_TOKEN = "tok";

    const config = loadConfigFromEnv();
    expect(config.baseUrl).toBe("https://test.atlassian.net");
  });

  it("strips /wiki/ (with trailing slash) from CONFLUENCE_URL", () => {
    process.env.CONFLUENCE_URL = "https://test.atlassian.net/wiki/";
    process.env.CONFLUENCE_EMAIL = "a@b.com";
    process.env.CONFLUENCE_TOKEN = "tok";

    const config = loadConfigFromEnv();
    expect(config.baseUrl).toBe("https://test.atlassian.net");
  });

  it("prefers ATLASSIAN_* over CONFLUENCE_*", () => {
    process.env.ATLASSIAN_URL = "https://primary.atlassian.net";
    process.env.ATLASSIAN_EMAIL = "primary@b.com";
    process.env.ATLASSIAN_TOKEN = "primary-tok";
    process.env.CONFLUENCE_URL = "https://fallback.atlassian.net/wiki";
    process.env.CONFLUENCE_EMAIL = "fallback@b.com";
    process.env.CONFLUENCE_TOKEN = "fallback-tok";

    const config = loadConfigFromEnv();
    expect(config.baseUrl).toBe("https://primary.atlassian.net");
    expect(config.email).toBe("primary@b.com");
    expect(config.token).toBe("primary-tok");
  });

  it("throws when no variables are set", () => {
    expect(() => loadConfigFromEnv()).toThrow("Missing required environment variables:");
  });

  it("lists all missing variables in error message", () => {
    expect(() => loadConfigFromEnv()).toThrow(
      /ATLASSIAN_URL.*ATLASSIAN_EMAIL.*ATLASSIAN_TOKEN/,
    );
  });

  it("throws for partially set variables", () => {
    process.env.ATLASSIAN_URL = "https://test.atlassian.net";
    expect(() => loadConfigFromEnv()).toThrow(/ATLASSIAN_EMAIL.*ATLASSIAN_TOKEN/);
  });

  it("uses singular 'variable' when only one is missing", () => {
    process.env.ATLASSIAN_URL = "https://test.atlassian.net";
    process.env.ATLASSIAN_EMAIL = "a@b.com";
    expect(() => loadConfigFromEnv()).toThrow("Missing required environment variable: ATLASSIAN_TOKEN");
  });

  it("shows set variables in error output", () => {
    process.env.ATLASSIAN_URL = "https://test.atlassian.net";
    expect(() => loadConfigFromEnv()).toThrow("https://test.atlassian.net");
  });

  it("does not reveal the token value in error output", () => {
    process.env.ATLASSIAN_TOKEN = "secret-token";
    expect(() => loadConfigFromEnv()).not.toThrow("secret-token");
  });

  it("error message mentions config file as an alternative", () => {
    expect(() => loadConfigFromEnv()).toThrow(/config\.json/);
  });
});
