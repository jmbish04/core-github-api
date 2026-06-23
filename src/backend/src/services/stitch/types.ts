export interface CreateProjectParams {
  /** Prefer `title`. `name` is accepted as an alias for backward-compatibility with callers. */
  title?: string;
  name?: string;
}

export interface GetProjectParams {
  projectId: string;
}

export interface ListProjectsParams {
  filter?: string;
}

export interface GenerateScreenFromTextParams {
  projectId: string;
  prompt: string;
  deviceType?: "MOBILE" | "DESKTOP" | "TABLET" | "AGNOSTIC" | "DEVICE_TYPE_UNSPECIFIED";
  modelId?: string;
}

export interface EditScreensParams {
  projectId: string;
  /** Editing prompt / instructions. Also accepted as `editPrompt` for backward-compatibility. */
  prompt?: string;
  editPrompt?: string;
  /** Screens to edit. Also accepted as `screenIds` for backward-compatibility. */
  selectedScreenIds?: string[];
  screenIds?: string[];
  deviceType?: "MOBILE" | "DESKTOP" | "TABLET" | "AGNOSTIC" | "DEVICE_TYPE_UNSPECIFIED";
  modelId?: string;
}

export interface GetScreenParams {
  projectId: string;
  screenId: string;
}

export interface ListScreensParams {
  projectId: string;
}

/** Alias params for route-level callers that expect a `name`-keyed project. */
export interface GetProjectByNameParams {
  name: string;
  projectId?: string;
}
