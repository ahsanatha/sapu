import React, { useEffect, useMemo, useState } from "react";
import ArticleSearchFilter, {
  ArticleSearchFilterState,
} from "../components/ArticleSearchFilter";

type Site = { id: string; name: string; enabled?: boolean };
type Article = {
  id: string;
  site_id: string;
  url: string;
  title?: string;
  metadata?: any;
  created_at?: string;
};

export default function Articles() {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [items, setItems] = useState<Article[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [limit] = useState<number>(20);
  const [offset, setOffset] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const siteMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of sites) m[s.id] = s.name;
    return m;
  }, [sites]);

  const fetchSites = async () => {
    try {
      const res = await fetch(`/api/sites?enabled=true`);
      const data = await res.json();
      setSites(Array.isArray(data) ? data : []);
    } catch (e) {
      setSites([]);
    }
  };

  const fetchArticles = async (opts?: {
    append?: boolean;
    nextOffset?: number;
  }) => {
    const params = new URLSearchParams();
    if (q.trim().length) params.set("q", q.trim());
    if (siteId.trim().length) params.set("site_id", siteId.trim());
    params.set("limit", String(limit));
    params.set("offset", String(opts?.nextOffset ?? offset));
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/articles?${params.toString()}`);
      const data = await res.json();
      const list: Article[] = Array.isArray(data?.items) ? data.items : [];
      setHasMore(list.length >= limit);
      if (opts?.append) {
        setItems((prev) => [...prev, ...list]);
      } else {
        setItems(list);
      }
    } catch (e) {
      setError("Failed to load articles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSites();
  }, []);

  useEffect(() => {
    setOffset(0);
    fetchArticles({ append: false, nextOffset: 0 });
  }, [q, siteId, limit]);

  const onLoadMore = async () => {
    const next = offset + limit;
    setOffset(next);
    await fetchArticles({ append: true, nextOffset: next });
  };

  return (
    <div className="container mx-auto px-6 py-10">
      <ArticleSearchFilter
        value={{ q, siteId } as ArticleSearchFilterState}
        onChange={(next) => {
          setQ(next.q || "");
          setSiteId(next.siteId || "");
        }}
        loading={loading}
        siteOptions={sites.map((s) => ({ id: s.id, name: s.name }))}
        categories={["General", "Sports", "Business", "Technology"]}
        tagsOptions={["policy", "economy", "football", "ai"]}
      />

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((a) => {
          const siteName = siteMap[a.site_id] || "Unknown";
          let domain = "";
          try {
            domain = new URL(a.url).host;
          } catch {}
          const ts = a.created_at
            ? new Date(a.created_at).toLocaleString()
            : "";
          return (
            <div
              key={a.id}
              className="rounded-md border border-slate-200 bg-white"
            >
              <div className="p-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-900 line-clamp-2">
                  <a
                    className="hover:underline"
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {a.title || a.url}
                  </a>
                </h3>
              </div>
              <div className="p-4">
                <div className="flex justify-between items-center text-xs">
                  <div className="text-slate-600">
                    {siteName}
                    {domain ? ` · ${domain}` : ""}
                  </div>
                  <div className="text-slate-500">{ts}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-center mt-8">
        <button
          onClick={onLoadMore}
          disabled={loading || !hasMore}
          className="min-w-[160px] inline-flex items-center justify-center rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60 px-4 py-2 text-sm font-medium"
        >
          {loading ? "Loading..." : hasMore ? "Load more" : "No more"}
        </button>
      </div>
    </div>
  );
}
