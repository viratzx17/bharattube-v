"use client";

import React, { useState, useEffect, useCallback } from "react";
import { History, Trash2, ListVideo } from "lucide-react";
import {
  VideoCard,
  VideoListItem,
  VideoItem,
  SkeletonGrid,
  EmptyState,
  ErrorState,
} from "./VideoComponents";
import { useApp } from "@/context/AppContext";
import { apiUrl, unwrapList } from "@/lib/api-config";
import { adaptVideos } from "@/lib/backend-adapter";

type FeedKey = "history" | "liked" | "watch_later" | "my_videos";
type RemoveMode = "history" | "watch_later" | "delete_video" | null;

export function CollectionPage({
  title,
  subtitle,
  icon,
  feed,
  layout = "list",
  removeMode = null,
  allowClearAll = false,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  onEmptyAction,
  requiresAuth = true,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  feed: FeedKey;
  layout?: "list" | "grid";
  removeMode?: RemoveMode;
  allowClearAll?: boolean;
  emptyTitle: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  requiresAuth?: boolean;
}) {
  const { user, loadingAuth, openAuthModal, showToast, triggerFeedRefresh, feedRefreshTrigger } =
    useApp();

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const needsAuth = requiresAuth && !user;

  const load = useCallback(async () => {
    if (needsAuth) {
      setLoading(false);
      setVideos([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(apiUrl(`/videos?feed=${feed}`), { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load");
      setVideos(adaptVideos(data) as unknown as VideoItem[]);
    } catch {
      setError("Could not load this section from the server.");
    } finally {
      setLoading(false);
    }
  }, [feed, needsAuth]);

  useEffect(() => {
    if (!loadingAuth) load();
  }, [load, loadingAuth, feedRefreshTrigger]);

  const handleRemove = async (videoId: number) => {
    try {
      let res: Response;
      if (removeMode === "history") {
        res = await fetch(apiUrl("/activity"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "remove_history_item", videoId }),
        });
      } else if (removeMode === "watch_later") {
        res = await fetch(apiUrl(`/videos/${videoId}`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "watch_later" }),
        });
      } else {
        res = await fetch(apiUrl(`/videos/${videoId}`), { method: "DELETE" });
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data?.error || "Action failed", "error");
        return;
      }

      setVideos((prev) => prev.filter((v) => v.id !== videoId));
      triggerFeedRefresh();
      showToast(
        removeMode === "delete_video"
          ? "Video deleted"
          : removeMode === "watch_later"
          ? "Removed from Watch Later"
          : "Removed from watch history",
        "success"
      );
    } catch {
      showToast("Network error", "error");
    }
  };

  const handleClearAll = async () => {
    try {
      const res = await fetch(apiUrl("/activity"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_watch_history" }),
      });
      if (!res.ok) {
        showToast("Failed to clear watch history", "error");
        return;
      }
      setVideos([]);
      setConfirmClear(false);
      triggerFeedRefresh();
      showToast("Watch history cleared", "success");
    } catch {
      showToast("Network error", "error");
    }
  };

  return (
    <div className="max-w-[1500px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          {icon && (
            <div className="w-10 h-10 rounded-xl bg-zinc-200/70 dark:bg-zinc-800/80 flex items-center justify-center text-red-600">
              {icon}
            </div>
          )}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && (
              <p className="text-xs text-zinc-500 mt-0.5">
                {subtitle}
                {!loading && videos.length > 0 && (
                  <span className="tabular-nums">
                    {" "}
                    • {videos.length} {videos.length === 1 ? "item" : "items"}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        {allowClearAll && videos.length > 0 && (
          <div className="flex items-center gap-2">
            {confirmClear ? (
              <>
                <span className="text-xs text-zinc-500">Clear everything?</span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="px-3.5 py-1.5 rounded-full bg-red-600 text-white text-xs font-semibold cursor-pointer"
                >
                  Yes, clear
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="px-3.5 py-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-200/80 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-xs font-semibold cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear all</span>
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        layout === "grid" ? (
          <SkeletonGrid count={8} />
        ) : (
          <div className="space-y-3 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-28 rounded-2xl bg-zinc-200 dark:bg-zinc-800"
              />
            ))}
          </div>
        )
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : needsAuth ? (
        <EmptyState
          title="Sign in required"
          description="This section stores private data that is only available to a signed-in account."
          actionLabel="Sign In"
          onAction={() => openAuthModal("login")}
          icon={icon || <ListVideo className="w-7 h-7 text-zinc-400" />}
        />
      ) : videos.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          actionLabel={emptyActionLabel}
          onAction={onEmptyAction}
          icon={icon || <ListVideo className="w-7 h-7 text-zinc-400" />}
        />
      ) : layout === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-8">
          {videos.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              onRemoveFromList={
                removeMode ? (vid) => setVideos((p) => p.filter((x) => x.id !== vid)) : undefined
              }
            />
          ))}
        </div>
      ) : (
        <div className="space-y-1 divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
          {videos.map((v) => (
            <VideoListItem
              key={v.id}
              video={v}
              onRemove={removeMode ? () => handleRemove(v.id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function HistoryIcon() {
  return <History className="w-5 h-5" />;
}
