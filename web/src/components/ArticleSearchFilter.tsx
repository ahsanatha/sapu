import React, { useEffect, useMemo, useRef, useState } from "react";

export type ArticleSearchFilterState = {
  q: string;
  siteId?: string;
  category?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
};

type Option = { id: string; name: string };

type Props = {
  value: ArticleSearchFilterState;
  onChange: (next: ArticleSearchFilterState) => void;
  loading?: boolean;
  siteOptions?: Option[];
  categories?: string[];
  tagsOptions?: string[];
};

export default function ArticleSearchFilter({
  value,
  onChange,
  loading,
  siteOptions = [],
  categories = [],
  tagsOptions = [],
}: Props) {
  const [local, setLocal] = useState<ArticleSearchFilterState>(value);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setLocal(value);
  }, [
    value.q,
    value.siteId,
    value.category,
    value.dateFrom,
    value.dateTo,
    JSON.stringify(value.tags || []),
  ]);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const next = { ...local, q: local.q || "" };
      onChange(next);
    }, 300);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [local.q]);

  const activeCount = useMemo(() => {
    let c = 0;
    if (local.q?.trim()) c++;
    if (local.siteId?.trim()) c++;
    if (local.category?.trim()) c++;
    if (local.dateFrom?.trim() || local.dateTo?.trim()) c++;
    if (local.tags && local.tags.length) c++;
    return c;
  }, [local]);

  const onImmediateChange = (patch: Partial<ArticleSearchFilterState>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    onChange(next);
  };

  const onReset = () => {
    const next: ArticleSearchFilterState = {
      q: "",
      siteId: "",
      category: "",
      tags: [],
      dateFrom: "",
      dateTo: "",
    };
    setLocal(next);
    onChange(next);
  };

  const tagSet = useMemo(() => new Set<string>(local.tags || []), [local.tags]);

  return (
    <div className="w-full">
      <div className="flex items-end gap-3 mb-3 flex-wrap">
        <div className="w-full sm:w-auto sm:min-w-[280px]">
          <label
            htmlFor="q"
            className="block text-xs font-medium text-slate-500 mb-1"
          >
            Search
          </label>
          <input
            id="q"
            aria-label="Search articles"
            title="Type to search, updates after 300ms"
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search by title or URL"
            value={local.q || ""}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setLocal((prev) => ({ ...prev, q: e.target.value }))
            }
          />
        </div>

        <div className="w-full sm:w-auto sm:min-w-[220px]">
          <label
            htmlFor="source"
            className="block text-xs font-medium text-slate-500 mb-1"
          >
            Source
          </label>
          <select
            id="source"
            aria-label="Filter by source"
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={local.siteId || ""}
            onChange={(e) => onImmediateChange({ siteId: e.target.value })}
          >
            <option value="">All sources</option>
            {siteOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="w-full sm:w-auto sm:min-w-[200px]">
          <label
            htmlFor="category"
            className="block text-xs font-medium text-slate-500 mb-1"
          >
            Category
          </label>
          <select
            id="category"
            aria-label="Filter by category"
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={local.category || ""}
            onChange={(e) => onImmediateChange({ category: e.target.value })}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="w-full sm:w-auto">
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Date range
          </label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label="Start date"
              className="flex h-10 w-full sm:w-auto rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={local.dateFrom || ""}
              onChange={(e) => onImmediateChange({ dateFrom: e.target.value })}
            />
            <span className="text-slate-500">to</span>
            <input
              type="date"
              aria-label="End date"
              className="flex h-10 w-full sm:w-auto rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={local.dateTo || ""}
              onChange={(e) => onImmediateChange({ dateTo: e.target.value })}
            />
          </div>
        </div>

        <div className="w-full">
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Tags
          </label>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Filter by tags"
          >
            {tagsOptions.map((t) => {
              const checked = tagSet.has(t);
              return (
                <label
                  key={t}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border ${checked ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700"}`}
                >
                  <input
                    type="checkbox"
                    aria-label={t}
                    checked={checked}
                    onChange={(e) => {
                      const next = new Set<string>(tagSet);
                      if (e.target.checked) next.add(t);
                      else next.delete(t);
                      onImmediateChange({ tags: Array.from(next) });
                    }}
                  />
                  <span>{t}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {loading && (
            <div
              role="status"
              aria-live="polite"
              className="text-xs text-slate-600"
            >
              Loading...
            </div>
          )}
          <button
            onClick={onReset}
            className="inline-flex items-center justify-center rounded-md bg-slate-200 text-slate-800 hover:bg-slate-300 px-4 py-2 text-sm font-medium"
          >
            Reset
          </button>
        </div>
      </div>

      {activeCount > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 mb-6"
          aria-live="polite"
        >
          <span className="text-xs text-slate-600">Active filters:</span>
          {local.q?.trim() && (
            <span className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700">
              q: {local.q.trim()}
            </span>
          )}
          {local.siteId?.trim() && (
            <span className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700">
              source
            </span>
          )}
          {local.category?.trim() && (
            <span className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700">
              {local.category}
            </span>
          )}
          {(local.dateFrom?.trim() || local.dateTo?.trim()) && (
            <span className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700">{`${local.dateFrom || ""}→${local.dateTo || ""}`}</span>
          )}
          {local.tags && local.tags.length > 0 && (
            <span className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700">
              tags: {local.tags.join(", ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
