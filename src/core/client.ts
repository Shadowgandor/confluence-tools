import { AtlassianConfig, AtlassianApiError } from "./types.js";

export class AtlassianClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly pathPrefix: string;

  constructor(config: AtlassianConfig, pathPrefix = "") {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.pathPrefix = pathPrefix;
    const encoded = Buffer.from(`${config.email}:${config.token}`).toString("base64");
    this.authHeader = `Basic ${encoded}`;
  }

  async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = path.startsWith("http")
      ? path
      : `${this.baseUrl}${this.pathPrefix}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        errorData = await response.text();
      }
      throw new AtlassianApiError(response.status, response.statusText, errorData);
    }

    if (response.status === 204) return undefined as T;

    return response.json() as Promise<T>;
  }
}
