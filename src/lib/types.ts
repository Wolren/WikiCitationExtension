export interface StorageSettings {
  modules: string;
  force: boolean;
  ref_names: boolean;
  auto_update?: boolean;
  author_style?: string;
  refresh_authors?: boolean;
  max_authors?: number;
  ids_to_fetch?: string;
  force_archive_all?: boolean;
  create_archive?: boolean;
  strip_issn?: boolean;
  rename_ref_names?: boolean;
  skip_org_authors?: boolean;
  spacing_style?: string;
  citation_style?: "cs1";
  sfn_page_conflict?: "rp" | "both" | "cite";
  cache_ttl_hours?: number;
  max_retries?: number;
  crossref_email?: string;
  ncbi_api_key?: string;
  semantic_scholar_api_key?: string;
}

export interface Citation {
  template: string;
  params: Record<string, string>;
  raw: string;
  start: number;
}

export interface ExpandResult {
  params: Record<string, string>;
  changes: string[];
}

export interface CleanupResult {
  params: Record<string, string>;
  changes: string[];
  renameParams?: Record<string, string>;
  newTemplateType?: string;
}

export interface DiffLine {
  type: "add" | "remove" | "keep";
  text: string;
}

export interface ArchiveResult {
  params: Record<string, string>;
  changes: string[];
}

export interface AuthorFetchSource {
  name: string;
  fetch: (doi: string) => Promise<[string, string][] | null>;
}

export type ProgressPhase = 'scanning' | 'processing' | 'applying' | 'done';

export interface ProgressInfo {
  current: number;
  total: number;
  phase: ProgressPhase;
  message: string;
}

export type ProgressCallback = (info: ProgressInfo) => void;

export interface ProcessStats {
  total: number;
  changed: number;
  expanded: number;
  cleaned: number;
  archived: number;
  enrichedIds: number;
  datesFixed: number;
  authorsProcessed: number;
  sortApplied: number;
  refNamesAdded: number;
  errors: number;
}

export interface ProcessingError {
  /** The raw citation text that failed */
  raw: string;
  /** The error message */
  message: string;
  /** Optional citation index in the original text */
  index?: number;
}

export interface ProcessResult {
  text: string;
  stats: ProcessStats;
  aborted: boolean;
  /** Errors encountered during processing, indexed by citation */
  errors: ProcessingError[];
}
