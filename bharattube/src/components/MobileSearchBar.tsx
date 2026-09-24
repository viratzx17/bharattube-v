"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, X, History as HistoryIcon, Loader2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { apiUrl } from "@/lib/api-config";

/**
 * Mobile-first search input used at the top of /search.
 * - real keyboard submit (enterKeyHint="search" + form submit)
 * - debounced suggestion/history fetch (no request per keystroke)
 * - clear + back controls
 * - records the query in the real backend search history
 */
export function MobileSearchBar({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const { user } = useApp();

  const [value, setValue] = useState(initialQuery);
  const [focused, setFocused] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setValue(initialQuery);
  }, [initialQuery]);

  // Autofocus only when arriving with no query (i.e. tapped the search icon).
  useEffect(() => {
    if (!initialQuery) {
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [initialQuery]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  /** Debounced suggestions from the real backend. */
  useEffect(() => {
    if (!focused) return;
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoadingSuggest(true);
      try {
        const res = await fetch(apiUrl(`/activity?type=search&q=${encodeURIComponent(value.trim())}`),
          { cache: "no-store", signal: controller.signal }
        );
        if (!res.ok) return;
        const data = await res.json();
        setHistory(Array.isArray(data.searchHistory) ? data.searchHistory : []);
        const fromTitles = Array.isArray(data.videos)
          ? data.videos.slice(0, 6).map((v: { title: string }) => v.title)
          : Array.isArray(data.data)
          ? data.data.slice(0, 6).map((v: { title: string }) => v.title)
          : [];
        const base = Array.isArray(data.suggestions) ? data.suggestions : [];
        setSuggestions(
          Array.from(new Set([...fromTitles, ...base])).slice(0, 8)
        );
      } catch {
        /* aborted or offline — keep previous list */
      } finally {
        setLoadingSuggest(false);
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [value, focused]);

  const submit = useCallback(
    (raw?: string) => {
      const q = (raw ?? value).trim();
      if (!q) return;
      setFocused(false);
      inputRef.current?.blur();
      if (user) {
        // Fire-and-forget; backend also respects the privacy setting.
        fetch(apiUrl("/activity"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "record_search", query: q }),
        }).catch(() => {});
      }
      router.push(`/search?q=${encodeURIComponent(q)}`);
    },
    [value, router, user]
  );

  const clearHistory = async () => {
    try {
      await fetch(apiUrl("/activity"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_search_history" }),
      });
      setHistory([]);
    } catch {
      /* ignore */
    }
  };

  const showPanel = focused && (history.length > 0 || suggestions.length > 0);

  return (
    <div ref={wrapRef} className="relative">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-1.5"
      >
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="md:hidden tap-target shrink-0 inline-flex items-center justify-center rounded-full text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200/70 dark:hover:bg-zinc-800 active:bg-zinc-300/70"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 min-w-0 flex items-center rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 focus-within:border-red-500 overflow-hidden">
          <input
            ref={inputRef}
            type="search"
            name="q"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            aria-label="Search BharatTube"
            placeholder="Search videos, channels, playlists"
            className="w-full min-w-0 px-4 py-2.5 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                setValue("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="tap-target shrink-0 inline-flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <button
          type="submit"
          aria-label="Search"
          disabled={!value.trim()}
          className="tap-target shrink-0 inline-flex items-center justify-center rounded-full bg-red-600 text-white disabled:opacity-40 active:scale-95 transition-transform"
        >
          <Search className="w-5 h-5" />
        </button>
      </form>

      {showPanel && (
        <div className="absolute left-0 right-0 top-full mt-2 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl py-2 z-40 max-h-[60vh] overflow-y-auto overscroll-contain">
          {loadingSuggest && (
            <div className="flex items-center gap-2 px-4 py-2 text-[11px] text-zinc-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading suggestions…
            </div>
          )}

          {history.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-4 py-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Recent
                </span>
                <button
                  type="button"
                  onClick={clearHistory}
                  className="text-[11px] font-semibold text-red-500 hover:underline"
                >
                  Clear
                </button>
              </div>
              {history.map((item) => (
                <button
                  key={`h-${item}`}
                  type="button"
                  onClick={() => {
                    setValue(item);
                    submit(item);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-zinc-700"
                >
                  <HistoryIcon className="w-4 h-4 text-zinc-400 shrink-0" />
                  <span className="truncate">{item}</span>
                </button>
              ))}
            </div>
          )}

          {suggestions.length > 0 && (
            <div>
              <div className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Suggestions
              </div>
              {suggestions.map((sug) => (
                <button
                  key={`s-${sug}`}
                  type="button"
                  onClick={() => {
                    setValue(sug);
                    submit(sug);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-zinc-700"
                >
                  <Search className="w-4 h-4 text-zinc-400 shrink-0" />
                  <span className="truncate">{sug}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
