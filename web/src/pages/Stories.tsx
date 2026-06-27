import React, { useEffect, useMemo, useState } from "react";

type StoryArticle = {
  id: string;
  url: string;
  title: string;
  site: string;
  created_at?: string;
};

type Story = {
  id: string;
  title: string;
  articles: StoryArticle[];
};

export default function Stories() {
  const [q, setQ] = useState<string>("");
  const [mode, setMode] = useState<"vertical" | "carousel" | "accordion">(
    "vertical",
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [stories, setStories] = useState<Story[]>([]);

  const getLocalMockStories = (): Story[] => {
    const now = new Date();
    const iso = (d: Date, minusMinutes = 0) =>
      new Date(d.getTime() - minusMinutes * 60000).toISOString();
    return [
      {
        id: "story-saudi-pro-league-salary",
        title: "Saudi Pro League Salary Debate",
        articles: [
          {
            id: "a1",
            url: "https://www.cnnindonesia.com/olahraga/20251129132956-142-1300813/hanya-ronaldo-yang-dinilai-pantas-digaji-tinggi-di-saudi-pro-league",
            title:
              "Hanya Ronaldo yang Dinilai Pantas Digaji Tinggi di Saudi Pro League",
            site: "CNN Indonesia",
            created_at: iso(now, 5),
          },
          {
            id: "a2",
            url: "https://example.com/saudi-pro-league-salary-analyst",
            title: "Analyst: Salary Structure in Saudi Pro League",
            site: "Example News",
            created_at: iso(now, 12),
          },
          {
            id: "a3",
            url: "https://sport360.com/saudi-pro-league-wages-breakdown",
            title: "Breaking down Saudi Pro League wages",
            site: "Sport360",
            created_at: iso(now, 18),
          },
        ],
      },
      {
        id: "story-asean-summit-climate",
        title: "ASEAN Summit Climate Commitments",
        articles: [
          {
            id: "b1",
            url: "https://channelnewsasia.com/world/asean-summit-climate-commitments-2025-12345",
            title: "ASEAN nations outline climate commitments at summit",
            site: "Channel NewsAsia",
            created_at: iso(now, 25),
          },
          {
            id: "b2",
            url: "https://southeastasiaglobe.com/asean-climate-pledges-2025/",
            title: "New climate pledges across ASEAN",
            site: "Southeast Asia Globe",
            created_at: iso(now, 31),
          },
          {
            id: "b3",
            url: "https://example.com/asean-carbon-market-initiative",
            title: "ASEAN considers regional carbon market initiative",
            site: "Example News",
            created_at: iso(now, 37),
          },
        ],
      },
      {
        id: "story-myanmar-business-recovery",
        title: "Myanmar Business Recovery Signals",
        articles: [
          {
            id: "c1",
            url: "https://www.mmtimes.com/business/market-recovery-2025.html",
            title: "Market recovery signals appear in Myanmar",
            site: "The Myanmar Times",
            created_at: iso(now, 44),
          },
          {
            id: "c2",
            url: "https://example.com/myanmar-sme-growth",
            title: "SME growth returns in Myanmar",
            site: "Example Business",
            created_at: iso(now, 50),
          },
          {
            id: "c3",
            url: "https://example.com/myanmar-exports-2025",
            title: "Myanmar exports show uptick in 2025",
            site: "Example Economy",
            created_at: iso(now, 58),
          },
        ],
      },
    ];
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/stories");
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (Array.isArray(data)) setStories(data as Story[]);
        else setStories(getLocalMockStories());
      } catch {
        setStories(getLocalMockStories());
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return stories;
    return stories
      .map((s) => ({
        ...s,
        articles: s.articles.filter(
          (a) =>
            s.title.toLowerCase().includes(t) ||
            a.title.toLowerCase().includes(t) ||
            a.site.toLowerCase().includes(t),
        ),
      }))
      .filter((s) => s.articles.length > 0);
  }, [q, stories]);

  return (
    <div className="container mx-auto px-6 py-10">
      <div className="flex items-end gap-3 mb-6 flex-wrap">
        <div className="w-full sm:w-auto sm:min-w-[280px]">
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Cari
          </label>
          <input
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Cari judul story atau artikel"
            value={q}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setQ(e.target.value)
            }
          />
        </div>
        <div className="w-full sm:w-auto">
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Mode
          </label>
          <div className="flex rounded-md border border-slate-200 overflow-hidden">
            {(["vertical", "carousel", "accordion"] as const).map((m) => (
              <button
                key={m}
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`px-3 py-2 text-sm transition-colors ${mode === m ? "bg-blue-50 text-blue-700" : "bg-white text-slate-700 hover:bg-slate-100"} ${m !== "vertical" ? "border-l border-slate-200" : ""}`}
                title={
                  m === "carousel"
                    ? "Horizontal carousel"
                    : m === "accordion"
                      ? "Expandable panels"
                      : "Vertical stacking"
                }
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setQ("")}
            className="inline-flex items-center justify-center rounded-md bg-blue-500 text-white hover:bg-blue-600 px-4 py-2 text-sm font-medium"
          >
            Reset
          </button>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-sm text-slate-600">
          Tidak ada story yang cocok.
        </div>
      )}

      <div className="space-y-8">
        {filtered.map((s) => (
          <section key={s.id} className="">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-slate-900">
                {s.title}
              </h2>
              <div className="text-xs text-slate-600">
                {s.articles.length} artikel
              </div>
            </div>

            {mode === "vertical" && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {s.articles.map((a) => {
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
                            {a.title}
                          </a>
                        </h3>
                      </div>
                      <div className="p-4">
                        <div className="flex justify-between items-center text-xs">
                          <div className="text-slate-600">
                            {a.site}
                            {domain ? ` · ${domain}` : ""}
                          </div>
                          <div className="text-slate-500">{ts}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {mode === "carousel" && (
              <div className="flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-2">
                {s.articles.map((a) => {
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
                      className="snap-start min-w-[280px] md:min-w-[320px] rounded-md border border-slate-200 bg-white"
                    >
                      <div className="p-4 border-b border-slate-100">
                        <h3 className="font-semibold text-slate-900 line-clamp-2">
                          <a
                            className="hover:underline"
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {a.title}
                          </a>
                        </h3>
                      </div>
                      <div className="p-4">
                        <div className="flex justify-between items-center text-xs">
                          <div className="text-slate-600">
                            {a.site}
                            {domain ? ` · ${domain}` : ""}
                          </div>
                          <div className="text-slate-500">{ts}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {mode === "accordion" && (
              <div className="rounded-md border border-slate-200 bg-white">
                <button
                  aria-expanded={expanded.has(s.id)}
                  onClick={() => {
                    const next = new Set(expanded);
                    if (next.has(s.id)) next.delete(s.id);
                    else next.add(s.id);
                    setExpanded(next);
                  }}
                  className="w-full text-left px-4 py-3 flex items-center justify-between"
                >
                  <span className="font-semibold text-slate-900">
                    {s.title}
                  </span>
                  <span className="text-xs text-slate-600">
                    {expanded.has(s.id) ? "Hide" : "Show"} articles
                  </span>
                </button>
                <div
                  className={`transition-all duration-300 overflow-hidden ${expanded.has(s.id) ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"}`}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4">
                    {s.articles.map((a) => {
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
                                {a.title}
                              </a>
                            </h3>
                          </div>
                          <div className="p-4">
                            <div className="flex justify-between items-center text-xs">
                              <div className="text-slate-600">
                                {a.site}
                                {domain ? ` · ${domain}` : ""}
                              </div>
                              <div className="text-slate-500">{ts}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
