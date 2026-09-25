"use client";

import React, { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Film,
  Flame,
  MoreVertical,
  Pencil,
  Trash2,
  EyeOff,
  Link2,
  Globe,
  ListPlus,
  Upload,
  X,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import {
  VideoItem,
  SkeletonGrid,
  EmptyState,
  ErrorState,
} from "@/components/VideoComponents";
import { formatCount, formatDuration, formatTimeAgo } from "@/lib/format";
import { apiUrl, unwrapList } from "@/lib/api-config";
import { adaptVideos } from "@/lib/backend-adapter";

type Tab = "videos" | "shorts";

function VisibilityBadge({ visibility }: { visibility: string }) {
  const v = (visibility || "public").toLowerCase();
  if (v === "private") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] font-semibold text-zinc-200">
        <EyeOff className="w-3 h-3" /> Private
      </span>
    );
  }
  if (v === "unlisted") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] font-semibold text-zinc-200">
        <Link2 className="w-3 h-3" /> Unlisted
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] font-semibold text-zinc-200">
      <Globe className="w-3 h-3" /> Public
    </span>
  );
}

function MyVideosContent() {
  const { openUploadModal, openPlaylistModal, showToast, triggerFeedRefresh } =
    useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab: Tab =
    searchParams.get("tab") === "shorts" ? "shorts" : "videos";

  const [tab, setTab] = useState<Tab>(initialTab);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [menuId, setMenuId] = useState<number | null>(null);
  const [editing, setEditing] = useState<VideoItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editVisibility, setEditVisibility] = useState("public");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(apiUrl("/videos?feed=my_videos"), { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load");
      setVideos(adaptVideos(data) as unknown as VideoItem[]);
    } catch {
      setError("Could not load your videos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return videos.filter((v) => (tab === "shorts" ? v.isShort : !v.isShort));
  }, [videos, tab]);

  const changeTab = (next: Tab) => {
    setTab(next);
    setMenuId(null);
    router.replace(next === "shorts" ? "/my-videos?tab=shorts" : "/my-videos");
  };

  const handleDelete = async (videoId: number) => {
    setMenuId(null);
    try {
      const res = await fetch(apiUrl(`/videos/${videoId}`), { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data?.error || "Delete failed", "error");
        return;
      }
      setVideos((prev) => prev.filter((v) => v.id !== videoId));
      triggerFeedRefresh();
      showToast("Video deleted", "success");
    } catch {
      showToast("Network error", "error");
    }
  };

  const handleVisibility = async (video: VideoItem, visibility: string) => {
    setMenuId(null);
    try {
      const res = await fetch(apiUrl(`/videos/${video.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data?.error || "Could not update visibility", "error");
        return;
      }
      setVideos((prev) =>
        prev.map((v) =>
          v.id === video.id ? { ...v, visibility: data.video?.visibility || visibility } : v
        )
      );
      triggerFeedRefresh();
      showToast(`Visibility set to ${visibility}`, "success");
    } catch {
      showToast("Network error", "error");
    }
  };

  const openEdit = (video: VideoItem) => {
    setMenuId(null);
    setEditing(video);
    setEditTitle(video.title);
    setEditDescription(video.description || "");
    setEditVisibility(video.visibility || "public");
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || saving) return;
    if (!editTitle.trim()) {
      showToast("Title is required", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`/videos/${editing.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim(),
          visibility: editVisibility,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data?.error || "Could not save changes", "error");
        return;
      }
      setVideos((prev) =>
        prev.map((v) =>
          v.id === editing.id
            ? {
                ...v,
                title: data.video?.title || editTitle.trim(),
                description: data.video?.description ?? editDescription.trim(),
                visibility: data.video?.visibility || editVisibility,
              }
            : v
        )
      );
      setEditing(null);
      triggerFeedRefresh();
      showToast("Video updated", "success");
    } catch {
      showToast("Network error", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 pb-10">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/you"
            className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Back to You"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">Your videos</h1>
            <p className="text-xs text-zinc-500">
              Manage everything you have uploaded
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openUploadModal}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Upload</span>
        </button>
      </div>

      <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 mb-4">
        <button
          type="button"
          onClick={() => changeTab("videos")}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
            tab === "videos"
              ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
              : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          <Film className="w-3.5 h-3.5" />
          Videos
        </button>
        <button
          type="button"
          onClick={() => changeTab("shorts")}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
            tab === "shorts"
              ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
              : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          Shorts
        </button>
      </div>

      {loading ? (
        <SkeletonGrid count={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={
            tab === "shorts"
              ? "No Shorts uploaded yet"
              : "No videos uploaded yet"
          }
          description={
            tab === "shorts"
              ? "Vertical Shorts you publish will appear here."
              : "Upload a video to start building your channel."
          }
          actionLabel="Upload"
          onAction={openUploadModal}
          icon={
            tab === "shorts" ? (
              <Flame className="w-7 h-7 text-zinc-400" />
            ) : (
              <Film className="w-7 h-7 text-zinc-400" />
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((video) => {
            const href = video.isShort
              ? `/shorts?id=${video.id}`
              : `/watch/${video.id}`;
            return (
              <div
                key={video.id}
                className="relative flex gap-3 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <Link
                  href={href}
                  className={`relative shrink-0 overflow-hidden rounded-lg bg-zinc-900 ${
                    video.isShort ? "w-20 aspect-[9/16]" : "w-36 sm:w-44 aspect-video"
                  }`}
                >
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/85 text-white text-[10px] font-medium tabular-nums">
                    {formatDuration(video.duration)}
                  </span>
                </Link>

                <div className="flex-1 min-w-0 pr-8">
                  <Link
                    href={href}
                    className="text-sm font-semibold line-clamp-2 text-zinc-900 dark:text-zinc-100 hover:text-red-500"
                  >
                    {video.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500 tabular-nums">
                    <VisibilityBadge visibility={video.visibility} />
                    <span>
                      {formatCount(video.viewsCount, "view", "views")}
                    </span>
                    <span>•</span>
                    <span>{formatTimeAgo(video.createdAt)}</span>
                  </div>
                </div>

                <div className="absolute top-2 right-2">
                  <button
                    type="button"
                    onClick={() =>
                      setMenuId((id) => (id === video.id ? null : video.id))
                    }
                    className="p-1.5 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
                    aria-label="More options"
                  >
                    <MoreVertical className="w-4 h-4 text-zinc-500" />
                  </button>
                  {menuId === video.id && (
                    <div className="absolute right-0 top-9 z-20 w-48 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl py-1 text-sm">
                      <button
                        type="button"
                        onClick={() => openEdit(video)}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4 text-zinc-400" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => openPlaylistModal(video.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                      >
                        <ListPlus className="w-4 h-4 text-zinc-400" /> Add to
                        playlist
                      </button>
                      <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
                      {(["public", "unlisted", "private"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => handleVisibility(video, v)}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 capitalize cursor-pointer"
                        >
                          {v === "public" ? (
                            <Globe className="w-4 h-4 text-zinc-400" />
                          ) : v === "unlisted" ? (
                            <Link2 className="w-4 h-4 text-zinc-400" />
                          ) : (
                            <EyeOff className="w-4 h-4 text-zinc-400" />
                          )}
                          {v}
                          {video.visibility === v && (
                            <span className="ml-auto text-[10px] text-red-500 font-semibold">
                              current
                            </span>
                          )}
                        </button>
                      ))}
                      <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
                      <button
                        type="button"
                        onClick={() => handleDelete(video.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-red-500 hover:bg-red-500/10 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={saveEdit}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-sm font-bold">Edit video</h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Visibility
                </label>
                <select
                  value={editVisibility}
                  onChange={(e) => setEditVisibility(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-sm"
                >
                  <option value="public">Public</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="private">Private</option>
                </select>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-full bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* click-away for menus */}
      {menuId !== null && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-10 cursor-default"
          onClick={() => setMenuId(null)}
        />
      )}
    </div>
  );
}

export default function MyVideosPage() {
  return (
    <ProtectedRoute
      title="Sign in to manage your videos"
      description="Your uploads, including private and unlisted videos, live behind authentication."
    >
      <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Loading...</div>}>
        <MyVideosContent />
      </Suspense>
    </ProtectedRoute>
  );
}
