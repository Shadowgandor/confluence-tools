import {
  ConfluenceConfig,
  ConfluencePage,
  ConfluenceSpace,
  ConfluenceApiError,
  PageCreateInput,
  PageUpdateInput,
  PageSearchOptions,
  PaginatedResponse,
} from "./types.js";

export class ConfluenceClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(config: ConfluenceConfig) {
    // Strip trailing slash
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    const encoded = Buffer.from(`${config.email}:${config.token}`).toString("base64");
    this.authHeader = `Basic ${encoded}`;
  }

  // ── Low-level request helper ─────────────────────────────────────

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;

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
      throw new ConfluenceApiError(response.status, response.statusText, errorData);
    }

    // 204 No Content (e.g. delete)
    if (response.status === 204) return undefined as T;

    return response.json() as Promise<T>;
  }

  // ── Authentication check ─────────────────────────────────────────

  async verifyConnection(): Promise<ConfluenceSpace[]> {
    const result = await this.request<PaginatedResponse<ConfluenceSpace>>(
      "/api/v2/spaces?limit=5",
    );
    return result.results;
  }

  // ── Spaces ───────────────────────────────────────────────────────

  async listSpaces(limit = 25): Promise<ConfluenceSpace[]> {
    const result = await this.request<PaginatedResponse<ConfluenceSpace>>(
      `/api/v2/spaces?limit=${limit}`,
    );
    return result.results;
  }

  async getSpaceByKey(spaceKey: string): Promise<ConfluenceSpace> {
    const result = await this.request<PaginatedResponse<ConfluenceSpace>>(
      `/api/v2/spaces?keys=${encodeURIComponent(spaceKey)}`,
    );
    if (result.results.length === 0) {
      throw new ConfluenceApiError(404, `Space with key "${spaceKey}" not found`);
    }
    return result.results[0];
  }

  // ── Read ─────────────────────────────────────────────────────────

  async getPage(pageId: string): Promise<ConfluencePage> {
    return this.request<ConfluencePage>(
      `/api/v2/pages/${pageId}?body-format=storage`,
    );
  }

  async listPages(spaceId: string, limit = 25): Promise<ConfluencePage[]> {
    const result = await this.request<PaginatedResponse<ConfluencePage>>(
      `/api/v2/spaces/${spaceId}/pages?limit=${limit}`,
    );
    return result.results;
  }

  async searchPages(options: PageSearchOptions): Promise<ConfluencePage[]> {
    const params = new URLSearchParams({
      spaceKey: options.spaceKey,
      expand: "body.storage,version",
      limit: String(options.limit ?? 25),
    });
    if (options.title) {
      params.set("title", options.title);
    }
    // CQL-based search uses v1 API
    const result = await this.request<PaginatedResponse<ConfluencePage>>(
      `/rest/api/content?${params.toString()}`,
    );
    return result.results;
  }

  // ── Create ───────────────────────────────────────────────────────

  async createPage(input: PageCreateInput): Promise<ConfluencePage> {
    const payload: Record<string, unknown> = {
      spaceId: input.spaceId,
      status: input.status ?? "current",
      title: input.title,
      body: {
        representation: "storage",
        value: input.body,
      },
    };
    if (input.parentId) {
      payload.parentId = input.parentId;
    }

    return this.request<ConfluencePage>("/api/v2/pages", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  // ── Update ───────────────────────────────────────────────────────

  async updatePage(input: PageUpdateInput): Promise<ConfluencePage> {
    // Fetch current version first
    const current = await this.getPage(input.pageId);

    const payload = {
      id: input.pageId,
      status: "current",
      title: input.title ?? current.title,
      body: {
        representation: "storage",
        value: input.body ?? current.body?.storage?.value ?? "",
      },
      version: {
        number: current.version.number + 1,
        message: input.versionMessage ?? "Updated via confluence-tools",
      },
    };

    return this.request<ConfluencePage>(`/api/v2/pages/${input.pageId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  // ── Delete ───────────────────────────────────────────────────────

  async deletePage(pageId: string): Promise<void> {
    await this.request<void>(`/api/v2/pages/${pageId}`, {
      method: "DELETE",
    });
  }
}
