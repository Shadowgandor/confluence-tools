import { readFile } from "fs/promises";
import { basename, extname } from "path";
import { AtlassianClient } from "../core/client.js";
import { AtlassianConfig, PaginatedResponse } from "../core/types.js";
import {
  ConfluencePage,
  ConfluenceSpace,
  ConfluenceAttachment,
  AttachmentUploadInput,
  PageCreateInput,
  PageUpdateInput,
  PageSearchOptions,
} from "./types.js";

function attachmentMimeType(filePath: string): string {
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".json": "application/json",
    ".xml": "application/xml",
    ".html": "text/html",
    ".md": "text/markdown",
  };
  return map[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export class ConfluenceClient {
  private readonly http: AtlassianClient;

  constructor(config: AtlassianConfig) {
    this.http = new AtlassianClient(config, "/wiki");
  }

  // ── Authentication check ─────────────────────────────────────────

  async verifyConnection(): Promise<ConfluenceSpace[]> {
    const result = await this.http.request<PaginatedResponse<ConfluenceSpace>>(
      "/api/v2/spaces?limit=5",
    );
    return result.results;
  }

  // ── Spaces ───────────────────────────────────────────────────────

  async listSpaces(limit = 25): Promise<ConfluenceSpace[]> {
    const result = await this.http.request<PaginatedResponse<ConfluenceSpace>>(
      `/api/v2/spaces?limit=${limit}`,
    );
    return result.results;
  }

  async getSpaceByKey(spaceKey: string): Promise<ConfluenceSpace> {
    const result = await this.http.request<PaginatedResponse<ConfluenceSpace>>(
      `/api/v2/spaces?keys=${encodeURIComponent(spaceKey)}`,
    );
    if (result.results.length === 0) {
      const { AtlassianApiError } = await import("../core/types.js");
      throw new AtlassianApiError(404, `Space with key "${spaceKey}" not found`);
    }
    return result.results[0];
  }

  // ── Read ─────────────────────────────────────────────────────────

  async getPage(pageId: string): Promise<ConfluencePage> {
    return this.http.request<ConfluencePage>(
      `/api/v2/pages/${pageId}?body-format=storage`,
    );
  }

  async listPages(spaceId: string, limit = 25): Promise<ConfluencePage[]> {
    const result = await this.http.request<PaginatedResponse<ConfluencePage>>(
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
    const result = await this.http.request<PaginatedResponse<ConfluencePage>>(
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

    return this.http.request<ConfluencePage>("/api/v2/pages", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  // ── Update ───────────────────────────────────────────────────────

  async updatePage(input: PageUpdateInput): Promise<ConfluencePage> {
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
        message: input.versionMessage ?? "Updated via atlassian-tools",
      },
    };

    return this.http.request<ConfluencePage>(`/api/v2/pages/${input.pageId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  // ── Delete ───────────────────────────────────────────────────────

  async deletePage(pageId: string): Promise<void> {
    await this.http.request<void>(`/api/v2/pages/${pageId}`, {
      method: "DELETE",
    });
  }

  // ── Attachments ───────────────────────────────────────────────────

  async uploadAttachment(input: AttachmentUploadInput): Promise<ConfluenceAttachment> {
    const { pageId, filePath, comment } = input;
    const fileBuffer = await readFile(filePath);
    const fileName = basename(filePath);
    const blob = new Blob([fileBuffer], { type: attachmentMimeType(filePath) });

    const formData = new FormData();
    formData.append("file", blob, fileName);
    if (comment) formData.append("comment", comment);

    const raw = await this.http.request<{
      results: Array<{
        id: string;
        title: string;
        metadata?: { mediaType?: string; comment?: string };
        _links?: { download?: string; webui?: string; base?: string };
      }>;
    }>(`/rest/api/content/${pageId}/child/attachment`, {
      method: "POST",
      body: formData,
      headers: { "X-Atlassian-Token": "no-check" },
    });

    const att = raw.results[0];
    return {
      id: att.id,
      title: att.title,
      mediaType: att.metadata?.mediaType ?? attachmentMimeType(filePath),
      comment: att.metadata?.comment,
      _links: att._links,
    };
  }

  async listAttachments(pageId: string): Promise<ConfluenceAttachment[]> {
    const result = await this.http.request<PaginatedResponse<ConfluenceAttachment>>(
      `/api/v2/pages/${pageId}/attachments`,
    );
    return result.results;
  }
}
