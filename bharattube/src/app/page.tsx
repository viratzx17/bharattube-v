"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Flame, History, PlusCircle } from "lucide-react";
import { VIDEO_CATEGORIES, formatDuration } from "@/lib/format";
import {
  VideoCard,
  VideoItem,
  SkeletonGrid,
  EmptyState,
  ErrorState,
} from "@/components/VideoComponents";
import { useApp } from "@/context/AppContext";
import { apiUrl, unwrapList } from "@/lib/api-config";
import { adaptVideos } from "@/lib/backend-adapter";

export default function HomePage() {
  const { user, openUploadModal, feedRefreshTrigger } = useApp();

  const [selectedCategory, setSelectedCategory] = useState("All");
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [continueWatching, setContinueWatching] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchHomeData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(apiUrl(`/videos?feed=home&category=${encodeURIComponent(selectedCategory)}`),
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Failed to load video feed");
      const data = await res.json();
      setVideos(adaptVideos(data) as unknown as VideoItem[]);

      if (user) {
        const histRes = await fetch(apiUrl("/videos?feed=history"), {
          cache: "no-store",
        });
        if (histRes.ok) {
          const histData = await histRes.json();
          const inProgress = (histData.videos || []).filter(
            (v: VideoItem) =>
              v.watchProgress &&
              v.watchProgress.progressSeconds > 0 &&
              v.watchProgress.completionPercentage < 98
          );
          setContinueWatching(inProgress.slice(0, 4));
        }
      } else {
        setContinueWatching([]);
      }
    } catch {
      setError("Unable to load videos from server.");
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, user]);

  useEffect(() => {
    fetchHomeData();
  }, [fetchHomeData, feedRefreshTrigger]);

  const standardVideos = videos.filter((v) => !v.isShort);
  const shortVideos = videos.filter((v) => v.isShort);

  return (
    <div className="px-3 sm:px-6 lg:px-8 py-3 sm:py-4 max-w-[1700px] mx-auto">
      {/* Sticky Category Filter Bar */}
      <div className="sticky top-14 z-20 bg-zinc-50/95 dark:bg-[#0F0F0F]/95 backdrop-blur-md py-2.5 -mx-3 px-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 border-b border-zinc-200/60 dark:border-zinc-800/60 mb-5">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {VIDEO_CATEGORIES.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`shrink-0 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors cursor-pointer active:scale-95 ${
                  active
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 font-semibold shadow-sm"
                    : "bg-zinc-200/80 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Continue Watching Section (Only real history when available) */}
      {continueWatching.length > 0 && selectedCategory === "All" && (
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-red-600" />
              <h2 className="text-base sm:text-lg font-bold tracking-tight">
                Continue Watching
              </h2>
            </div>
            <Link
              href="/history"
              className="text-xs font-semibold text-red-500 hover:underline"
            >
              View full history
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {continueWatching.map((v) => (
              <VideoCard key={`cw-${v.id}`} video={v} />
            ))}
          </div>
          <div className="mt-8 border-b border-zinc-200 dark:border-zinc-800/80" />
        </section>
      )}

      {/* Main Feed */}
      {loading ? (
        <SkeletonGrid count={8} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchHomeData} />
      ) : videos.length === 0 ? (
        <EmptyState
          title="No videos available yet"
          description={
            selectedCategory === "All"
              ? "The video catalog is currently empty. Be the first creator to upload and publish a real video or vertical Short."
              : `No videos have been published in the "${selectedCategory}" category yet.`
          }
          actionLabel="Upload a Video"
          onAction={openUploadModal}
          icon={<PlusCircle className="w-7 h-7 text-red-500" />}
        />
      ) : (
        <div className="space-y-10">
          {standardVideos.length > 0 && (
            <section>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-8">
                {standardVideos.map((video) => (
                  <VideoCard key={video.id} video={video} />
                ))}
              </div>
            </section>
          )}

          {shortVideos.length > 0 && (
            <section className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Flame className="w-5 h-5 text-red-600 fill-red-600" />
                  <h2 className="text-lg font-bold tracking-tight">Shorts</h2>
                </div>
                <Link
                  href="/shorts"
                  className="text-xs font-semibold text-red-500 hover:underline"
                >
                  Open Shorts Player
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {shortVideos.map((short) => (
                  <Link
                    key={short.id}
                    href={`/shorts?id=${short.id}`}
                    className="group flex flex-col gap-2"
                  >
                    <div className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800/60 shadow-sm">
                      <img
                        src={short.thumbnailUrl}
                        alt={short.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-white text-[11px] font-semibold">
                        {formatDuration(short.duration)}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold line-clamp-2 group-hover:text-red-500 transition-colors">
                      {short.title}
                    </h3>
                    <span className="text-xs text-zinc-500">
                      {short.viewsCount} views
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
