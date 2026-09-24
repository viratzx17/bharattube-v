"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  MoreVertical,
  Clock,
  ListPlus,
  Share2,
  EyeOff,
  Flag,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  BellCheck,
  Video as VideoIcon,
  AlertCircle,
} from "lucide-react";
import { formatDuration, formatCount, formatTimeAgo } from "@/lib/format";
import { useApp } from "@/context/AppContext";
import { apiUrl, isRouteNotFound, subscribeApiUrl } from "@/lib/api-config";
import { capabilityOf, isUnsupportedResponse } from "@/lib/backend-capabilities";
import { channelHref } from "@/lib/backend-adapter";

export interface CreatorInfo {
  id: number;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  isVerified?: boolean;
  subscriberCount?: number;
  bio?: string | null;
}

export interface VideoItem {
  id: number;
  userId: number;
  title: string;
  description: string;
  videoUrl: string;
  thumbnailUrl: string;
  duration: number;
  category: string;
  tags: string;
  visibility: string;
  isShort: boolean;
  isLive: boolean;
  forKids: boolean;
  viewsCount: number;
  likesCount: number;
  dislikesCount: number;
  commentsCount: number;
  createdAt: string;
  creator: CreatorInfo;
  /** Real per-user state from the backend feed (never assumed on the client). */
  userReaction?: "like" | "dislike" | null;
  isSubscribed?: boolean;
  watchProgress?: {
    progressSeconds: number;
    durationSeconds: number;
    completionPercentage: number;
    lastWatchedAt?: string;
  } | null;
}

export function UserAvatar({
  name,
  avatarUrl,
  size = "md",
  className = "",
}: {
  name: string;
  avatarUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizeClasses = {
    xs: "w-6 h-6 text-[11px]",
    sm: "w-8 h-8 text-xs",
    md: "w-9 h-9 text-sm",
    lg: "w-12 h-12 text-base",
    xl: "w-24 h-24 text-2xl",
  }[size];

  const initials = (name || "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClasses} rounded-full object-cover shrink-0 border border-zinc-700/40 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses} rounded-full bg-gradient-to-br from-red-600 to-rose-700 text-white font-semibold flex items-center justify-center shrink-0 select-none ${className}`}
    >
      {initials || "U"}
    </div>
  );
}

export function SubscribeButton({
  channelId,
  initialSubscribed,
  initialCount,
  onStatusChange,
  size = "md",
  isOwner: isOwnerProp,
}: {
  /** Channel handle (preferred) or id, as used by the deployed backend. */
  channelId: number | string;
  initialSubscribed: boolean;
  initialCount?: number;
  onStatusChange?: (isSubscribed: boolean, newCount: number) => void;
  size?: "sm" | "md";
  /** Explicit owner flag — avoids guessing from id types. */
  isOwner?: boolean;
}) {
  const { user, openAuthModal, showToast } = useApp();
  const [isSubscribed, setIsSubscribed] = useState(initialSubscribed);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setIsSubscribed(initialSubscribed);
  }, [initialSubscribed]);

  const ownsChannel =
    isOwnerProp ??
    Boolean(user && String(user.id) === String(channelId));

  if (ownsChannel) {
    return (
      <Link
        href={channelHref({ id: channelId })}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition-colors"
      >
        Manage Channel
      </Link>
    );
  }

  /**
   * Subscribe/unsubscribe.
   *
   * The backend currently has NO subscribe route (verified: POST/DELETE/PUT
   * /channel/:handle/subscribe → "Route not found"). We therefore call the real
   * route and, if the backend says it does not exist, we report that precisely.
   * We never fake a success and never change a count locally.
   */
  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      openAuthModal("login");
      showToast("Sign in to subscribe to this channel", "info");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(subscribeApiUrl(channelId), {
        method: isSubscribed ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        if (isRouteNotFound(data)) {
          showToast(
            "Subscriptions aren't available on this backend yet.",
            "error"
          );
          return;
        }
        showToast(
          (data && (data.message || data.error)) ||
            "Failed to update subscription",
          "error"
        );
        return;
      }

      // Trust only what the backend returned.
      const nextSubscribed =
        typeof data?.isSubscribed === "boolean"
          ? data.isSubscribed
          : typeof data?.data?.isSubscribed === "boolean"
          ? data.data.isSubscribed
          : !isSubscribed;

      setIsSubscribed(nextSubscribed);
      onStatusChange?.(
        nextSubscribed,
        typeof data?.subscriberCount === "number"
          ? data.subscriberCount
          : initialCount ?? 0
      );
      showToast(
        nextSubscribed ? "Subscription added" : "Unsubscribed from channel",
        "success"
      );
    } catch {
      showToast("Network error updating subscription", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const padding = size === "sm" ? "px-3.5 py-1.5 text-xs" : "px-4 py-2 text-sm";

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={submitting}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all cursor-pointer select-none ${padding} ${
        isSubscribed
          ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700"
          : "bg-white hover:bg-zinc-200 text-zinc-950 dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-950 shadow-sm"
      }`}
    >
      {isSubscribed ? (
        <>
          <BellCheck className="w-4 h-4 text-zinc-300" />
          <span>Subscribed</span>
        </>
      ) : (
        <span>Subscribe</span>
      )}
      {initialCount !== undefined && initialCount > 0 && (
        <span className="opacity-75 text-xs font-normal">
          {formatCount(initialCount)}
        </span>
      )}
    </button>
  );
}

export function LikeDislikePill({
  videoId,
  likesCount,
  dislikesCount,
  userReaction,
  onReactionChange,
}: {
  videoId: number;
  likesCount: number;
  dislikesCount: number;
  userReaction: "like" | "dislike" | null;
  onReactionChange: (
    likes: number,
    dislikes: number,
    reaction: "like" | "dislike" | null
  ) => void;
}) {
  const { user, openAuthModal, showToast } = useApp();
  const [busy, setBusy] = useState(false);

  const handleReact = async (type: "like" | "dislike") => {
    if (!user) {
      openAuthModal("login");
      showToast(`Sign in to ${type} this video`, "info");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(apiUrl(`/videos/${videoId}`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "react", type }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (res.ok && typeof data?.likesCount === "number") {
        // Only reflect what the backend actually confirmed.
        onReactionChange(
          data.likesCount,
          typeof data.dislikesCount === "number" ? data.dislikesCount : 0,
          data.userReaction ?? type
        );
      } else if (!res.ok && isUnsupportedResponse(data)) {
        // Backend has no like/reaction route — say so, never fake a count.
        showToast(capabilityOf("likes").message, "error");
      } else {
        showToast(data?.message || data?.error || "Reaction failed", "error");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex items-center rounded-full bg-zinc-200/80 dark:bg-zinc-800/90 border border-zinc-300/60 dark:border-zinc-700/70 overflow-hidden">
      <button
        type="button"
        onClick={() => handleReact("like")}
        disabled={busy}
        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
          userReaction === "like"
            ? "text-red-500 bg-red-500/10 font-semibold"
            : "text-zinc-800 dark:text-zinc-100 hover:bg-zinc-300/60 dark:hover:bg-zinc-700/70"
        }`}
      >
        <ThumbsUp
          className={`w-4 h-4 ${
            userReaction === "like" ? "fill-red-500 text-red-500" : ""
          }`}
        />
        <span className="tabular-nums">{formatCount(likesCount)}</span>
      </button>
      <div className="w-px h-5 bg-zinc-300 dark:bg-zinc-700" />
      <button
        type="button"
        onClick={() => handleReact("dislike")}
        disabled={busy}
        title="Dislike"
        className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium transition-colors cursor-pointer ${
          userReaction === "dislike"
            ? "text-red-500 bg-red-500/10 font-semibold"
            : "text-zinc-800 dark:text-zinc-100 hover:bg-zinc-300/60 dark:hover:bg-zinc-700/70"
        }`}
      >
        <ThumbsDown
          className={`w-4 h-4 ${
            userReaction === "dislike" ? "fill-red-500 text-red-500" : ""
          }`}
        />
        {dislikesCount > 0 && (
          <span className="tabular-nums text-xs">
            {formatCount(dislikesCount)}
          </span>
        )}
      </button>
    </div>
  );
}

export function VideoCard({
  video,
  onRemoveFromList,
}: {
  video: VideoItem;
  onRemoveFromList?: (videoId: number) => void;
}) {
  const { user, openAuthModal, openPlaylistModal, showToast, triggerFeedRefresh } =
    useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  if (hidden) return null;

  const watchHref = video.isShort
    ? `/shorts?id=${video.id}`
    : `/watch/${video.id}`;

  const handleSaveWatchLater = async () => {
    setMenuOpen(false);
    if (!user) {
      openAuthModal("login");
      showToast("Sign in to save videos to Watch Later", "info");
      return;
    }
    try {
      const res = await fetch(apiUrl(`/videos/${video.id}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "watch_later" }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(
          data.isSaved ? "Saved to Watch Later" : "Removed from Watch Later",
          "success"
        );
      }
    } catch {
      showToast("Failed to update Watch Later", "error");
    }
  };

  const handleShare = async () => {
    setMenuOpen(false);
    const url = `${window.location.origin}${watchHref}`;
    // Native mobile share sheet when available, clipboard fallback otherwise.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: video.title, url });
        return;
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("Video link copied to clipboard", "success");
    } catch {
      showToast(url, "info");
    }
  };

  const handleNotInterested = async () => {
    setMenuOpen(false);
    setHidden(true);
    if (user) {
      await fetch(apiUrl(`/videos/${video.id}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "not_interested" }),
      });
    }
    showToast("Video removed from your recommendations", "info");
  };

  const handleReport = async () => {
    setMenuOpen(false);
    if (!user) {
      openAuthModal("login");
      return;
    }
    await fetch(apiUrl(`/videos/${video.id}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "report",
        reason: "Flagged by user from feed",
      }),
    });
    showToast("Thank you. Video reported for review.", "info");
  };

  const handleDeleteOwnVideo = async () => {
    setMenuOpen(false);
    try {
      const res = await fetch(apiUrl(`/videos/${video.id}`), {
        method: "DELETE",
      });
      if (res.ok) {
        setHidden(true);
        triggerFeedRefresh();
        onRemoveFromList?.(video.id);
        showToast("Video permanently deleted", "success");
      }
    } catch {
      showToast("Failed to delete video", "error");
    }
  };

  return (
    <div className="group flex flex-col gap-3 relative">
      {/* Thumbnail Container */}
      <Link
        href={watchHref}
        className="relative block w-full aspect-video rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800/60 shadow-sm"
      >
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300 ease-out"
        />

        {/* Visibility / Live / Shorts / Duration Badge */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
          {video.visibility !== "public" && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/90 text-zinc-950 text-[10px] font-bold uppercase">
              {video.visibility}
            </span>
          )}
          {video.isLive ? (
            <span className="px-2 py-0.5 rounded bg-red-600 text-white text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              LIVE
            </span>
          ) : video.isShort ? (
            <span className="px-2 py-0.5 rounded bg-red-600/95 text-white text-[11px] font-bold uppercase">
              SHORTS · {formatDuration(video.duration)}
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-black/85 text-white text-xs font-medium tabular-nums">
              {formatDuration(video.duration)}
            </span>
          )}
        </div>

        {/* Saved Watch Progress Bar */}
        {video.watchProgress &&
          video.watchProgress.completionPercentage > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-700/80">
              <div
                className="h-full bg-red-600 transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(4, video.watchProgress.completionPercentage)
                  )}%`,
                }}
              />
            </div>
          )}
      </Link>

      {/* Metadata Row */}
      <div className="flex items-start gap-3 pr-6 relative">
        <Link href={channelHref(video.creator)} className="shrink-0 mt-0.5">
          <UserAvatar
            name={video.creator.displayName}
            avatarUrl={video.creator.avatarUrl}
            size="md"
          />
        </Link>

        <div className="flex flex-col min-w-0 flex-1">
          <Link
            href={watchHref}
            className="text-[15px] font-semibold leading-snug text-zinc-900 dark:text-zinc-100 line-clamp-2 group-hover:text-red-500 transition-colors"
          >
            {video.title}
          </Link>

          <Link
            href={channelHref(video.creator)}
            className="mt-1 inline-flex items-center gap-1 text-[13px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors truncate"
          >
            <span className="truncate">{video.creator.displayName}</span>
            {video.creator.isVerified && (
              <CheckCircle2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            )}
          </Link>

          <div className="text-[12.5px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mt-0.5 tabular-nums">
            <span>{formatCount(video.viewsCount, "view", "views")}</span>
            <span>•</span>
            <span>{formatTimeAgo(video.createdAt)}</span>
          </div>
        </div>

        {/* More Options Button & Dropdown */}
        <div ref={menuRef} className="absolute right-0 top-0">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setMenuOpen((o) => !o);
            }}
            className="tap-target inline-flex items-center justify-center rounded-full text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-zinc-800 active:bg-zinc-300/60 transition-colors cursor-pointer"
            aria-label="More options"
            aria-expanded={menuOpen}
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-11 w-52 max-w-[calc(100vw-2rem)] rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl py-1.5 z-40 text-sm">
              <button
                type="button"
                onClick={handleSaveWatchLater}
                className="w-full flex items-center gap-3 px-3.5 py-2 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <Clock className="w-4 h-4 text-zinc-400" />
                <span>Save to Watch Later</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  openPlaylistModal(video.id);
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <ListPlus className="w-4 h-4 text-zinc-400" />
                <span>Save to Playlist</span>
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="w-full flex items-center gap-3 px-3.5 py-2 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <Share2 className="w-4 h-4 text-zinc-400" />
                <span>Share</span>
              </button>
              <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
              <button
                type="button"
                onClick={handleNotInterested}
                className="w-full flex items-center gap-3 px-3.5 py-2 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <EyeOff className="w-4 h-4 text-zinc-400" />
                <span>Not interested</span>
              </button>
              <button
                type="button"
                onClick={handleReport}
                className="w-full flex items-center gap-3 px-3.5 py-2 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <Flag className="w-4 h-4 text-zinc-400" />
                <span>Report</span>
              </button>
              {user && user.id === video.userId && (
                <>
                  <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
                  <button
                    type="button"
                    onClick={handleDeleteOwnVideo}
                    className="w-full flex items-center gap-3 px-3.5 py-2 text-left text-red-500 hover:bg-red-500/10 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Video</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function VideoListItem({
  video,
  compact = false,
  onRemove,
}: {
  video: VideoItem;
  compact?: boolean;
  onRemove?: (videoId: number) => void;
}) {
  const watchHref = video.isShort
    ? `/shorts?id=${video.id}`
    : `/watch/${video.id}`;

  return (
    <div className="group flex flex-row items-start gap-3 p-2 rounded-xl hover:bg-zinc-100/70 dark:hover:bg-zinc-900/60 active:bg-zinc-200/60 dark:active:bg-zinc-800/60 transition-colors relative">
      <Link
        href={watchHref}
        className={`relative block shrink-0 rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800/50 aspect-video ${
          compact ? "w-40 sm:w-44" : "w-40 xs:w-44 sm:w-64"
        }`}
      >
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
        />
        <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/85 text-white text-[11px] font-medium tabular-nums">
          {formatDuration(video.duration)}
        </span>
        {video.watchProgress &&
          video.watchProgress.completionPercentage > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-700/80">
              <div
                className="h-full bg-red-600"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(4, video.watchProgress.completionPercentage)
                  )}%`,
                }}
              />
            </div>
          )}
      </Link>

      <div className="flex flex-col flex-1 min-w-0 pr-6">
        <Link
          href={watchHref}
          className={`font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-2 group-hover:text-red-500 transition-colors ${
            compact ? "text-sm" : "text-sm sm:text-base"
          }`}
        >
          {video.title}
        </Link>
        <Link
          href={channelHref(video.creator)}
          className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white inline-flex items-center gap-1"
        >
          <span>{video.creator.displayName}</span>
          {video.creator.isVerified && (
            <CheckCircle2 className="w-3 h-3 text-zinc-400" />
          )}
        </Link>
        <div className="text-xs text-zinc-500 mt-0.5 tabular-nums">
          {formatCount(video.viewsCount, "view", "views")} •{" "}
          {formatTimeAgo(video.createdAt)}
        </div>
        {!compact && video.description && (
          <p className="mt-2 hidden sm:line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
            {video.description}
          </p>
        )}
      </div>

      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(video.id)}
          title="Remove"
          aria-label="Remove"
          className="tap-target inline-flex items-center justify-center shrink-0 rounded-full text-zinc-400 hover:text-red-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function SkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-8">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="flex flex-col gap-3 animate-pulse">
          <div className="w-full aspect-video rounded-xl bg-zinc-200 dark:bg-zinc-800/80" />
          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-11/12" />
              <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-2/3" />
              <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800/80 bg-zinc-100/40 dark:bg-zinc-900/30 my-4">
      <div className="w-14 h-14 rounded-2xl bg-zinc-200/80 dark:bg-zinc-800/80 flex items-center justify-center text-zinc-500 dark:text-zinc-400 mb-4">
        {icon || <VideoIcon className="w-7 h-7" />}
      </div>
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </h3>
      {description && (
        <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400 max-w-md">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-red-600 hover:bg-red-500 text-white text-sm font-semibold shadow-md transition-colors cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 rounded-2xl border border-red-500/20 bg-red-500/5 my-4">
      <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
      <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
        {message}
      </h3>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 px-4 py-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold cursor-pointer"
        >
          Try Again
        </button>
      )}
    </div>
  );
}
