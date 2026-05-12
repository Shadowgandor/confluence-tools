export interface ConfluencePage {
  id: string;
  title: string;
  status: string;
  spaceId: string;
  version: { number: number; message?: string; createdAt?: string };
  body?: { storage?: { value: string } };
  _links?: { webui?: string; base?: string };
}

export interface ConfluenceSpace {
  id: string;
  key: string;
  name: string;
  type: string;
  status: string;
}

export interface PageCreateInput {
  spaceId: string;
  title: string;
  body: string;
  parentId?: string;
  status?: "current" | "draft";
}

export interface PageUpdateInput {
  pageId: string;
  title?: string;
  body?: string;
  versionMessage?: string;
}

export interface PageSearchOptions {
  spaceKey: string;
  title?: string;
  limit?: number;
}
