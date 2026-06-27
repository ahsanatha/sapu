// Centralized type definitions for ACQ v3 configuration
// Keep lean and aligned with entity-driven JSON stored in DB

export type WaitUntil = 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';

export interface PageLoadConfig {
  timeout?: number;
  wait_until?: WaitUntil;
  protocol_timeout?: number;
  headless?: boolean;
  use_shared_browser?: boolean;
  disable_sandbox?: boolean;
  args?: string[];
  extra_args?: string[];
}

export interface PaginationConfig {
  max_pages?: number;
  start_page?: number;
  query_param?: string;
  template?: string;
  path_segment_names?: string[];
}

export interface UrlCollectionConfig {
  enabled?: boolean;
  max_depth?: number;
  page_load?: PageLoadConfig;
  pagination?: PaginationConfig;
  index_patterns?: string[]; // e.g., ['indeks'] or full paths
  collection_type?: 'general' | 'indeks';
  index_match_type?: 'includes' | 'path_segment';
  max_urls_per_run?: number;
  max_links_on_page?: number;
  dedupe_ttl_minutes?: number;
  respect_robots_txt?: boolean;
  robots_disallow_patterns?: string[];
  max_concurrency?: number;
  max_found_urls?: number;
  max_collected_urls?: number;
  max_index_pages_per_run?: number;
  max_index_jobs_urls?: number;
  // Optional browser/language overrides for URL collection
  user_agent?: string;
  http_headers?: Record<string, string>;
  accept_language?: string;
  navigator_language?: string;
  navigator_languages?: string[];
  timezone?: string;
  viewport?: Viewport;
}

export interface Viewport {
  width: number;
  height: number;
  deviceScaleFactor?: number;
  isMobile?: boolean;
}

export interface ScrapingSelectors {
  links?: string;
  title?: string[];
  content?: string[];
  publish_time?: string[];
}

export interface ScrapingPublishTimeConfig {
  required?: boolean;
  raw_fallback?: boolean;
  enforce_rfc3339?: boolean;
}

export interface ScrapingConfig {
  timeout?: number;
  page_load?: PageLoadConfig;
  selectors?: ScrapingSelectors;
  publish_time?: ScrapingPublishTimeConfig;
  extract_links?: boolean;
  follow_patterns?: string[]; // supports 'regex:' prefix
  exclude_patterns?: string[];
  selectors_by_host?: Record<string, Partial<ScrapingSelectors> & { publish_time?: string[] }>;
  // Optional browser/language overrides for scraping
  user_agent?: string;
  http_headers?: Record<string, string>;
  accept_language?: string;
  navigator_language?: string;
  navigator_languages?: string[];
  timezone?: string;
  viewport?: Viewport;
  block_resources?: string[];
  disable_javascript?: boolean;
  selector_wait_timeout_ms?: number;
}

export interface ClassificationConfig {
  article_patterns?: string[]; // supports 'regex:' prefix
  exclude_patterns?: string[];
}

export interface DuplicatePreventionConfig {
  check_url?: boolean;
  check_existing_articles?: boolean;
}

export interface SiteConfig {
  scraping?: ScrapingConfig;
  classification?: ClassificationConfig;
  url_collection?: UrlCollectionConfig;
  duplicate_prevention?: DuplicatePreventionConfig;
  debug?: { dump_html?: boolean };
}

export interface Site {
  id: string;
  name: string;
  base_url: string;
  config: SiteConfig;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}
