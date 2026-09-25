"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  Suspense,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Flame,
  ThumbsUp,
  MessageSquare,
  Share2,
  Volume2,
  VolumeX,
  X,
  Play,
  Loader2,
  Send,
} from "lucide-react";
import {
  UserAvatar,
  SubscribeButton,
  VideoItem,
  EmptyState,
  ErrorState,
} from "@/components/VideoComponents";
import { formatCount, formatTimeAgo } from "@/lib/format";
import { useApp } from "@/context/AppContext";
import { apiUrl } from "@/lib/api-config";
import { channelHref } from "@/lib/backend-adapter";

interface ShortComment {
  id: number;
  content: string;
  createdAt: string;
  author: {
    id: number;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

/** One full-screen short. Plays only while it is the active slide. */
function ShortSlide({
  short,
  active,
  muted,
  onToggleMute,
  onOpenComments,
  onLiked,
  onViewCounted,
}: {
  short: VideoItem & { userReaction?: "like" | "dislike" | null };
  active: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onOpenComments: () => void;
  onLiked: (likes: number, reaction: "like" | "dislike" | null) => void;
  onViewCounted: (views: number) => void;
}) {
  const { user, openAuthModal, showToast } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [busyLike, setBusyLike] = useState(false);

  const watchedRef = useRef(0);
  const reportedRef = useRef(false);
  const sessionKeyRef = useRef("");

  useEffect(() => {
    let key = sessionStorage.getItem("bharattube_playback_session");
    if (!key) {
      key = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem("bharattube_playback_session", key);
    }
    sessionKeyRef.current = key;
  }, []);

  // Play/pause strictly follows the active slide.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) {
      v.currentTime = 0;
      watchedRef.current = 0;
      reportedRef.current = false;
      v.play()
        .then(() => setPaused(false))
        .catch(() => setPaused(true));
    } else {
      v.pause();
    }
  }, [active]);

  /**
   * Genuine view tracking — same backend contract as the main player:
   * real watched seconds are accumulated while playing and posted to
   * POST /api/videos/[id] { action: "view_progress" }. The server applies
   * its own duplicate/cooldown rules; we never increment locally.
   */
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(async () => {
      const v = videoRef.current;
      if (!v || v.paused) return;
      watchedRef.current += 1;

      const duration = v.duration && Number.isFinite(v.duration) ? v.duration : short.duration || 1;
      const shouldReport =
        !reportedRef.current && watchedRef.current >= 2;

      if (shouldReport || watchedRef.current % 5 === 0) {
        reportedRef.current = true;
        try {
          const res = await fetch(apiUrl(`/videos/${short.id}`), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "view_progress",
              watchedSeconds: watchedRef.current,
              currentPosition: Math.round(v.currentTime),
              duration: Math.round(duration),
              sessionKey: sessionKeyRef.current,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (typeof data.viewsCount === "number") onViewCounted(data.viewsCount);
          }
        } catch {
          /* offline — retry on next tick */
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [active, short.id, short.duration, onViewCounted]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play()
        .then(() => setPaused(false))
        .catch(() => {});
    } else {
      v.pause();
      setPaused(true);
    }
  };

  const handleLike = async () => {
    if (!user) {
      openAuthModal("login");
      showToast("Sign in to like this Short", "info");
      return;
    }
    if (busyLike) return;
    setBusyLike(true);
    try {
      const res = await fetch(apiUrl(`/videos/${short.id}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "react", type: "like" }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data?.error || "Could not like this Short", "error");
        return;
      }
      onLiked(data.likesCount, data.userReaction);
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setBusyLike(false);
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/shorts?id=${short.id}`;
    // Native share sheet on mobile, clipboard fallback everywhere else.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: short.title, url });
        return;
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied", "success");
    } catch {
      showToast(url, "info");
    }
  };

  const liked = short.userReaction === "like";

  return (
    <section className="snap-item relative h-[calc(100dvh-7rem-env(safe-area-inset-bottom,0px))] md:h-[calc(100dvh-3.5rem)] w-full flex items-center justify-center bg-black">
      <video
        ref={videoRef}
        src={short.videoUrl}
        poster={short.thumbnailUrl}
        loop
        muted={muted}
        playsInline
        preload={active ? "auto" : "none"}
        onClick={togglePlay}
        className="max-h-full max-w-full w-auto h-full object-contain sm:rounded-2xl"
      />

      {paused && active && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play"
          className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-sm"
        >
          <Play className="w-7 h-7 fill-white ml-1" />
        </button>
      )}

      <button
        type="button"
        onClick={onToggleMute}
        aria-label={muted ? "Unmute" : "Mute"}
        className="absolute top-3 right-3 tap-target rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-sm active:scale-95"
      >
        {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
      </button>

      {/* Bottom info */}
      <div className="absolute bottom-0 inset-x-0 p-4 pr-20 pb-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent text-white px-safe">
        <div className="flex items-center gap-2.5 mb-2">
          <Link href={channelHref(short.creator)} aria-label={`Open ${short.creator.displayName} channel`}>
            <UserAvatar
              name={short.creator.displayName}
              avatarUrl={short.creator.avatarUrl}
              size="sm"
            />
          </Link>
          <Link
            href={channelHref(short.creator)}
            className="font-bold text-sm truncate hover:underline"
          >
            @{short.creator.username}
          </Link>
          <SubscribeButton
            channelId={short.creator.id}
            initialSubscribed={Boolean(
              (short as unknown as { isSubscribed?: boolean }).isSubscribed
            )}
            size="sm"
          />
        </div>
        <h2 className="text-sm font-semibold line-clamp-2">{short.title}</h2>
        <div className="text-[11px] text-zinc-300 mt-1 tabular-nums">
          {formatCount(short.viewsCount, "view", "views")} •{" "}
          {formatTimeAgo(short.createdAt)}
        </div>
      </div>

      {/* Right action rail */}
      <div className="absolute right-2 bottom-24 flex flex-col items-center gap-3 text-white px-safe">
        <button
          type="button"
          onClick={handleLike}
          disabled={busyLike}
          aria-label={liked ? "Remove like" : "Like"}
          aria-pressed={liked}
          className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
        >
          <span
            className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-sm ${
              liked ? "bg-red-600" : "bg-black/55"
            }`}
          >
            <ThumbsUp className={`w-5 h-5 ${liked ? "fill-white" : ""}`} />
          </span>
          <span className="text-[11px] font-semibold tabular-nums">
            {formatCount(short.likesCount)}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenComments}
          aria-label="Comments"
          className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
        >
          <span className="w-11 h-11 rounded-full bg-black/55 flex items-center justify-center backdrop-blur-sm">
            <MessageSquare className="w-5 h-5" />
          </span>
          <span className="text-[11px] font-semibold tabular-nums">
            {formatCount(short.commentsCount)}
          </span>
        </button>

        <button
          type="button"
          onClick={handleShare}
          aria-label="Share"
          className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
        >
          <span className="w-11 h-11 rounded-full bg-black/55 flex items-center justify-center backdrop-blur-sm">
            <Share2 className="w-5 h-5" />
          </span>
          <span className="text-[11px] font-semibold">Share</span>
        </button>
      </div>
    </section>
  );
}

function CommentsSheet({
  videoId,
  onClose,
  onPosted,
}: {
  videoId: number;
  onClose: () => void;
  onPosted: () => void;
}) {
  const { user, openAuthModal, showToast } = useApp();
  const [items, setItems] = useState<ShortComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(apiUrl(`/comments?videoId=${videoId}`), {
        cache: "no-store",
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.comments || []);
    } catch {
      setError("Could not load comments.");
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      openAuthModal("login");
      return;
    }
    const content = text.trim();
    if (!content || posting) return;
    setPosting(true);
    try {
      const res = await fetch(apiUrl("/comments"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", videoId, content }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data?.error || "Could not post comment", "error");
        return;
      }
      setText("");
      await load();
      onPosted();
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center sm:justify-center bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-md h-[75dvh] sm:h-[70vh] rounded-t-2xl sm:rounded-2xl bg-white dark:bg-zinc-900 border-t sm:border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <span className="font-bold text-sm">Comments ({items.length})</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close comments"
            className="tap-target inline-flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-zinc-500">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : error ? (
            <div className="py-8 text-center">
              <p className="text-xs text-zinc-500 mb-3">{error}</p>
              <button
                type="button"
                onClick={load}
                className="px-4 py-2 rounded-full bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold"
              >
                Retry
              </button>
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-xs text-zinc-500 py-10">
              No comments yet. Be the first to comment.
            </p>
          ) : (
            items.map((c) => (
              <div key={c.id} className="flex items-start gap-2.5">
                <UserAvatar
                  name={c.author.displayName}
                  avatarUrl={c.author.avatarUrl}
                  size="xs"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100">
                    @{c.author.username}{" "}
                    <span className="font-normal text-zinc-500">
                      {formatTimeAgo(c.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-700 dark:text-zinc-300 mt-0.5 break-words">
                    {c.content}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input pinned above the on-screen keyboard */}
        <form
          onSubmit={submit}
          className="shrink-0 p-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2 pb-safe bg-white dark:bg-zinc-900"
        >
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => {
              if (!user) openAuthModal("login");
            }}
            enterKeyHint="send"
            placeholder={user ? "Add a comment…" : "Sign in to comment"}
            aria-label="Add a comment"
            className="flex-1 min-w-0 px-3.5 py-2.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          <button
            type="submit"
            disabled={!text.trim() || posting}
            aria-label="Post comment"
            className="tap-target shrink-0 inline-flex items-center justify-center rounded-full bg-red-600 text-white disabled:opacity-40 active:scale-95"
          >
            {posting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function ShortsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialIdParam = searchParams.get("id");
  const { openUploadModal, feedRefreshTrigger } = useApp();

  const [shorts, setShorts] = useState<
    Array<VideoItem & { userReaction?: "like" | "dislike" | null }>
  >([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(true); // mobile autoplay requires muted
  const [commentsFor, setCommentsFor] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const didInitialScroll = useRef(false);

  const fetchShorts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(apiUrl("/videos?isShort=true"), { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setShorts(data.videos || []);
    } catch {
      setError("Could not load Shorts. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShorts();
  }, [fetchShorts, feedRefreshTrigger]);

  // Deep link: /shorts?id=123 scrolls to that short once loaded.
  useEffect(() => {
    if (didInitialScroll.current || shorts.length === 0 || !initialIdParam) return;
    const idx = shorts.findIndex((s) => s.id === Number(initialIdParam));
    if (idx >= 0) {
      didInitialScroll.current = true;
      setActiveIndex(idx);
      requestAnimationFrame(() => {
        slideRefs.current[idx]?.scrollIntoView({ block: "start" });
      });
    }
  }, [shorts, initialIdParam]);

  /** Native scroll-snap + IntersectionObserver = reliable swipe on all phones. */
  useEffect(() => {
    const root = containerRef.current;
    if (!root || shorts.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const idx = Number((entry.target as HTMLElement).dataset.index);
            if (!Number.isNaN(idx)) {
              setActiveIndex(idx);
              const id = shorts[idx]?.id;
              if (id) {
                // Keep the URL shareable as the user swipes.
                window.history.replaceState(null, "", `/shorts?id=${id}`);
              }
            }
          }
        });
      },
      { root, threshold: [0.6] }
    );

    slideRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [shorts]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70dvh]">
        <Loader2 className="w-7 h-7 text-red-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto px-4 py-10">
        <ErrorState message={error} onRetry={fetchShorts} />
      </div>
    );
  }

  if (shorts.length === 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-10">
        <EmptyState
          title="No Shorts available yet"
          description="Vertical Shorts uploaded by creators will appear here."
          actionLabel="Create a Short"
          onAction={openUploadModal}
          icon={<Flame className="w-7 h-7 text-red-500" />}
        />
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className="snap-y-mandatory h-[calc(100dvh-7rem-env(safe-area-inset-bottom,0px))] md:h-[calc(100dvh-3.5rem)] overflow-y-scroll no-scrollbar"
      >
        {shorts.map((short, idx) => (
          <div
            key={short.id}
            data-index={idx}
            ref={(el) => {
              slideRefs.current[idx] = el;
            }}
          >
            <ShortSlide
              short={short}
              active={idx === activeIndex}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
              onOpenComments={() => setCommentsFor(short.id)}
              onLiked={(likes, reaction) =>
                setShorts((prev) =>
                  prev.map((s) =>
                    s.id === short.id
                      ? { ...s, likesCount: likes, userReaction: reaction }
                      : s
                  )
                )
              }
              onViewCounted={(views) =>
                setShorts((prev) =>
                  prev.map((s) =>
                    s.id === short.id ? { ...s, viewsCount: views } : s
                  )
                )
              }
            />
          </div>
        ))}
      </div>

      {commentsFor !== null && (
        <CommentsSheet
          videoId={commentsFor}
          onClose={() => setCommentsFor(null)}
          onPosted={() =>
            setShorts((prev) =>
              prev.map((s) =>
                s.id === commentsFor
                  ? { ...s, commentsCount: (s.commentsCount || 0) + 1 }
                  : s
              )
            )
          }
        />
      )}
    </>
  );
}

export default function ShortsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-[70dvh] text-sm text-zinc-500">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      }
    >
      <ShortsContent />
    </Suspense>
  );
}
