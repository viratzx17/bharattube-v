"use client";

import React, { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  Share2,
  Clock,
  ListPlus,
  Flag,
  CheckCircle2,
  ThumbsUp,
  MessageSquare,
  CornerDownRight,
  Trash2,
  Edit3,
  ChevronDown,
  ChevronUp,
  Check,
} from "lucide-react";
import { VideoPlayer } from "@/components/VideoPlayer";
import {
  UserAvatar,
  SubscribeButton,
  LikeDislikePill,
  VideoListItem,
  VideoItem,
  ErrorState,
} from "@/components/VideoComponents";
import { formatCount, formatTimeAgo } from "@/lib/format";
import { useApp } from "@/context/AppContext";
import { apiUrl } from "@/lib/api-config";
import { adaptVideo, adaptVideos, unwrapEnvelope, listOf, channelHref } from "@/lib/backend-adapter";
import { isUnsupportedResponse, capabilityOf } from "@/lib/backend-capabilities";

interface CommentData {
  id: number;
  videoId: number;
  userId: number;
  parentId: number | null;
  content: string;
  likesCount: number;
  userLiked: boolean;
  createdAt: string;
  updatedAt: string;
  author: {
    id: number;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    isVerified: boolean;
  };
}

export default function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const videoId = Number(id);

  const { user, preferences, openAuthModal, openPlaylistModal, showToast } =
    useApp();

  const [video, setVideo] = useState<
    | (VideoItem & {
        userReaction: "like" | "dislike" | null;
        isSubscribed: boolean;
        isSaved: boolean;
      })
    | null
  >(null);
  const [relatedVideos, setRelatedVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [theaterMode, setTheaterMode] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  // Comments state
  const [comments, setComments] = useState<CommentData[]>([]);
  const [commentSort, setCommentSort] = useState<"newest" | "top">("newest");
  /** True when this backend exposes no comments route at all. */
  const [commentsUnsupported, setCommentsUnsupported] = useState(false);
  const [newCommentText, setNewCommentText] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [replyingToId, setReplyingToId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");

  /**
   * Loads the video from the deployed backend.
   *
   * VERIFIED contract: GET /videos/:id → { success, statusCode, message, data }
   * where `data` is the video object (404 → "Video not found").
   * Related videos come from the real GET /videos list (backend has no
   * dedicated related endpoint).
   */
  const fetchWatchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(apiUrl(`/videos/${videoId}`), { cache: "no-store" });
      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }

      if (!res.ok) {
        const msg =
          payload && typeof payload === "object"
            ? String((payload as Record<string, any>).message || "")
            : "";
        setError(
          /route '.*' not found/i.test(msg)
            ? "Video playback isn't available on this backend."
            : msg || "Video unavailable"
        );
        return;
      }

      const adapted = adaptVideo(unwrapEnvelope(payload));
      if (!adapted) {
        setError("Video unavailable");
        return;
      }

      setVideo({
        ...(adapted as unknown as VideoItem),
        userReaction: null,
        isSubscribed: false,
        isSaved: false,
      } as any);

      // Real related videos from the live list endpoint (exclude this one).
      const vres = await fetch(apiUrl("/videos"), { cache: "no-store" });
      if (vres.ok) {
        const vpayload = await vres.json();
        const related = (adaptVideos(vpayload) as unknown as VideoItem[]).filter(
          (v) => String(v.id) !== String(videoId)
        );
        setRelatedVideos(related.slice(0, 15));
      } else {
        setRelatedVideos([]);
      }
    } catch {
      setError("Network error loading video.");
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  /**
   * Comments.
   * VERIFIED: the backend has no comment route, so we surface that clearly
   * rather than rendering a misleading "no comments yet" empty state.
   */
  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(
        apiUrl(`/comments?videoId=${videoId}&sort=${commentSort}`),
        { cache: "no-store" }
      );

      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }

      if (res.ok) {
        setCommentsUnsupported(false);
        const list = listOf(payload, "comments");
        setComments(list as unknown as CommentData[]);
        return;
      }

      if (isUnsupportedResponse(payload)) {
        setCommentsUnsupported(true);
        setComments([]);
        return;
      }

      setCommentsUnsupported(false);
      setComments([]);
    } catch {
      // network problem: leave whatever we had
    }
  }, [videoId, commentSort]);

  useEffect(() => {
    fetchWatchData();
  }, [fetchWatchData]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleToggleWatchLater = async () => {
    if (!user) {
      openAuthModal("login");
      showToast("Sign in to save videos to Watch Later", "info");
      return;
    }
    if (!video) return;
    const res = await fetch(apiUrl(`/videos/${video.id}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "watch_later" }),
    });
    if (res.ok) {
      const data = await res.json();
      setVideo((prev) => (prev ? { ...prev, isSaved: data.isSaved } : prev));
      showToast(
        data.isSaved ? "Saved to Watch Later" : "Removed from Watch Later",
        "success"
      );
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    // Web Share API gives the real native sheet on Android/iOS.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: video?.title || "BharatTube", url });
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

  const handleReportVideo = async () => {
    if (!user) {
      openAuthModal("login");
      return;
    }
    if (!video) return;
    await fetch(apiUrl(`/videos/${video.id}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "report",
        reason: "Reported from watch page",
      }),
    });
    showToast("Video reported to moderation team", "info");
  };

  const handleAddComment = async (e: React.FormEvent, parentId: number | null = null) => {
    e.preventDefault();
    if (!user) {
      openAuthModal("login");
      showToast("Sign in to post a comment", "info");
      return;
    }
    const content = (parentId ? replyText : newCommentText).trim();
    if (!content) return;

    setPostingComment(true);
    try {
      const res = await fetch(apiUrl("/comments"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          videoId,
          content,
          parentId,
        }),
      });
      if (res.ok) {
        if (parentId) {
          setReplyText("");
          setReplyingToId(null);
        } else {
          setNewCommentText("");
        }
        await fetchComments();
        showToast(parentId ? "Reply added" : "Comment posted", "success");
      }
    } finally {
      setPostingComment(false);
    }
  };

  const handleEditComment = async (commentId: number) => {
    if (!editContent.trim()) return;
    const res = await fetch(apiUrl("/comments"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "edit",
        commentId,
        content: editContent.trim(),
      }),
    });
    if (res.ok) {
      setEditingCommentId(null);
      await fetchComments();
      showToast("Comment updated", "success");
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    const res = await fetch(apiUrl("/comments"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", commentId }),
    });
    if (res.ok) {
      await fetchComments();
      showToast("Comment deleted", "info");
    }
  };

  const handleLikeComment = async (commentId: number) => {
    if (!user) {
      openAuthModal("login");
      return;
    }
    const res = await fetch(apiUrl("/comments"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "like", commentId }),
    });
    if (res.ok) {
      const data = await res.json();
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, likesCount: data.likesCount, userLiked: data.userLiked }
            : c
        )
      );
    }
  };

  const handleReportComment = async (commentId: number) => {
    if (!user) {
      openAuthModal("login");
      return;
    }
    await fetch(apiUrl("/comments"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "report", commentId }),
    });
    showToast("Comment reported", "info");
  };

  if (loading) {
    return (
      <div className="max-w-[1650px] mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
        <div className="lg:col-span-2 space-y-4">
          <div className="w-full aspect-video rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-6 bg-zinc-200 dark:bg-zinc-800 rounded w-3/4" />
          <div className="h-12 bg-zinc-200 dark:bg-zinc-800 rounded-xl w-full" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 bg-zinc-200 dark:bg-zinc-800 rounded-xl"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <ErrorState
          message={error || "Video unavailable"}
          onRetry={fetchWatchData}
        />
      </div>
    );
  }

  const rootComments = comments.filter((c) => !c.parentId);
  const getReplies = (parentId: number) =>
    comments.filter((c) => c.parentId === parentId);

  return (
    <div className="max-w-[1650px] mx-auto px-0 sm:px-6 py-0 sm:py-5">
      <div
        className={`grid grid-cols-1 ${
          theaterMode ? "grid-cols-1" : "lg:grid-cols-12"
        } gap-6`}
      >
        {/* Primary Column: Player, Metadata, Creator, Comments */}
        <div className={theaterMode ? "w-full" : "lg:col-span-8"}>
          <VideoPlayer
            videoId={video.id}
            videoUrl={video.videoUrl}
            thumbnailUrl={video.thumbnailUrl}
            title={video.title}
            initialDuration={video.duration}
            savedProgressSeconds={video.watchProgress?.progressSeconds || 0}
            theaterMode={theaterMode}
            onToggleTheater={() => setTheaterMode((t) => !t)}
            onViewsUpdated={(newViews) =>
              setVideo((prev) =>
                prev ? { ...prev, viewsCount: newViews } : prev
              )
            }
            autoPlay={preferences?.autoplay ?? false}
            initialPlaybackRate={preferences?.defaultPlaybackRate ?? 1}
            initialCaptions={preferences?.captionsByDefault ?? false}
          />

          {/* Video Title */}
          <h1 className="mt-4 px-3 sm:px-0 text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-100 leading-snug">
            {video.title}
          </h1>

          {/* Creator & Action Bar */}
          <div className="mt-3 px-3 sm:px-0 flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-zinc-800">
            {/* Creator Info + Subscribe Button */}
            <div className="flex items-center gap-3">
              <Link href={channelHref(video.creator)}>
                <UserAvatar
                  name={video.creator.displayName}
                  avatarUrl={video.creator.avatarUrl}
                  size="lg"
                />
              </Link>
              <div className="mr-2">
                <Link
                  href={channelHref(video.creator)}
                  className="font-bold text-sm sm:text-base text-zinc-900 dark:text-zinc-100 hover:text-red-500 inline-flex items-center gap-1"
                >
                  <span>{video.creator.displayName}</span>
                  {video.creator.isVerified && (
                    <CheckCircle2 className="w-4 h-4 text-zinc-400" />
                  )}
                </Link>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                  {formatCount(
                    video.creator.subscriberCount || 0,
                    "Subscriber",
                    "Subscribers"
                  )}
                </div>
              </div>

              <SubscribeButton
                channelId={video.creator.id}
                initialSubscribed={video.isSubscribed}
                onStatusChange={(sub, newCount) => {
                  setVideo((prev) =>
                    prev
                      ? {
                          ...prev,
                          isSubscribed: sub,
                          creator: { ...prev.creator, subscriberCount: newCount },
                        }
                      : prev
                  );
                }}
              />
            </div>

            {/* Video Action Pills */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap w-full sm:w-auto pb-1">
              <LikeDislikePill
                videoId={video.id}
                likesCount={video.likesCount}
                dislikesCount={video.dislikesCount}
                userReaction={video.userReaction}
                onReactionChange={(likes, dislikes, reaction) => {
                  setVideo((prev) =>
                    prev
                      ? {
                          ...prev,
                          likesCount: likes,
                          dislikesCount: dislikes,
                          userReaction: reaction,
                        }
                      : prev
                  );
                }}
              />

              <button
                type="button"
                onClick={handleShare}
                className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-zinc-200/80 dark:bg-zinc-800/90 hover:bg-zinc-300/70 dark:hover:bg-zinc-700 active:scale-95 text-zinc-900 dark:text-zinc-100 text-sm font-medium transition-all cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>Share</span>
              </button>

              <button
                type="button"
                onClick={handleToggleWatchLater}
                className={`shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all active:scale-95 cursor-pointer ${
                  video.isSaved
                    ? "bg-red-600/15 text-red-500 border border-red-500/30"
                    : "bg-zinc-200/80 dark:bg-zinc-800/90 hover:bg-zinc-300/70 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                }`}
              >
                {video.isSaved ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Clock className="w-4 h-4" />
                )}
                <span>{video.isSaved ? "Saved" : "Watch Later"}</span>
              </button>

              <button
                type="button"
                onClick={() => openPlaylistModal(video.id)}
                className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-zinc-200/80 dark:bg-zinc-800/90 hover:bg-zinc-300/70 dark:hover:bg-zinc-700 active:scale-95 text-zinc-900 dark:text-zinc-100 text-sm font-medium transition-all cursor-pointer"
              >
                <ListPlus className="w-4 h-4" />
                <span>Playlist</span>
              </button>

              <button
                type="button"
                onClick={handleReportVideo}
                title="Report video"
                aria-label="Report video"
                className="shrink-0 tap-target inline-flex items-center justify-center rounded-full bg-zinc-200/80 dark:bg-zinc-800/90 hover:bg-zinc-300/70 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer"
              >
                <Flag className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Description Box */}
          <div className="mt-4 mx-3 sm:mx-0 p-4 rounded-2xl bg-zinc-200/60 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 text-sm">
            <div className="flex flex-wrap items-center gap-3 font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
              <span>{formatCount(video.viewsCount, "view", "views")}</span>
              <span>•</span>
              <span>{formatTimeAgo(video.createdAt)}</span>
              <span className="px-2.5 py-0.5 rounded-full bg-zinc-300/70 dark:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {video.category}
              </span>
            </div>

            <div
              className={`mt-2 text-zinc-700 dark:text-zinc-300 whitespace-pre-line ${
                descExpanded ? "" : "line-clamp-2"
              }`}
            >
              {video.description || "No description provided for this video."}
            </div>

            {video.tags && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {video.tags
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .map((tag, idx) => (
                    <span
                      key={idx}
                      className="text-xs text-red-500 font-medium"
                    >
                      #{tag}
                    </span>
                  ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setDescExpanded((e) => !e)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-zinc-900 dark:text-white hover:underline cursor-pointer"
            >
              {descExpanded ? (
                <>
                  <span>Show less</span>
                  <ChevronUp className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  <span>Show more</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>

          {/* Real Comments Section */}
          <section className="mt-6 px-3 sm:px-0">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-6">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-red-600" />
                  <span>
                    {formatCount(comments.length, "Comment", "Comments")}
                  </span>
                </h2>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setCommentSort("top")}
                    className={`px-3 py-1.5 rounded-full font-semibold cursor-pointer ${
                      commentSort === "top"
                        ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950"
                        : "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                    }`}
                  >
                    Top comments
                  </button>
                  <button
                    type="button"
                    onClick={() => setCommentSort("newest")}
                    className={`px-3 py-1.5 rounded-full font-semibold cursor-pointer ${
                      commentSort === "newest"
                        ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950"
                        : "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                    }`}
                  >
                    Newest first
                  </button>
                </div>
              </div>
            </div>

            {/* Add Comment Input */}
            <form
              onSubmit={(e) => handleAddComment(e, null)}
              className="flex items-start gap-3 mb-6"
            >
              <UserAvatar
                name={user?.displayName || "Guest"}
                avatarUrl={user?.avatarUrl}
                size="md"
              />
              <div className="flex-1">
                <input
                  type="text"
                  value={newCommentText}
                  enterKeyHint="send"
                  aria-label="Add a comment"
                  onFocus={(e) => {
                    if (!user) openAuthModal("login");
                    // Keep the input above the on-screen keyboard.
                    setTimeout(
                      () => e.target.scrollIntoView({ block: "center", behavior: "smooth" }),
                      300
                    );
                  }}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  className="w-full pb-2 bg-transparent border-b border-zinc-300 dark:border-zinc-700 focus:border-red-500 text-sm focus:outline-none"
                />
                {newCommentText.trim() && (
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setNewCommentText("")}
                      className="px-3.5 py-1.5 rounded-full text-xs font-semibold text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={postingComment}
                      className="px-4 py-1.5 rounded-full bg-red-600 hover:bg-red-500 text-white text-xs font-semibold cursor-pointer"
                    >
                      Comment
                    </button>
                  </div>
                )}
              </div>
            </form>

            {/* Comments List */}
            {commentsUnsupported ? (
              <div className="py-10 text-center text-sm text-zinc-500 border border-dashed border-amber-500/40 bg-amber-500/5 rounded-2xl px-4">
                {capabilityOf("comments").message}
                <div className="text-[11px] text-zinc-500 mt-1">
                  The API responds{" "}
                  <span className="font-mono">
                    Route &apos;/comments&apos; not found
                  </span>
                  , so no comments are shown.
                </div>
              </div>
            ) : rootComments.length === 0 ? (
              <div className="py-10 text-center text-sm text-zinc-500 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
                No comments yet. Start the conversation!
              </div>
            ) : (
              <div className="space-y-5">
                {rootComments.map((comment) => {
                  const replies = getReplies(comment.id);
                  return (
                    <div key={comment.id} className="flex items-start gap-3">
                      <Link href={channelHref(comment.author)}>
                        <UserAvatar
                          name={comment.author.displayName}
                          avatarUrl={comment.author.avatarUrl}
                          size="md"
                        />
                      </Link>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <Link
                            href={channelHref(comment.author)}
                            className="font-bold text-zinc-900 dark:text-zinc-100 hover:underline"
                          >
                            @{comment.author.username}
                          </Link>
                          <span className="text-zinc-500">
                            {formatTimeAgo(comment.createdAt)}
                          </span>
                        </div>

                        {editingCommentId === comment.id ? (
                          <div className="mt-2 space-y-2">
                            <input
                              type="text"
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="w-full px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-sm"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleEditComment(comment.id)}
                                className="px-3 py-1 rounded-full bg-red-600 text-white text-xs font-semibold cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingCommentId(null)}
                                className="px-3 py-1 rounded-full bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">
                            {comment.content}
                          </p>
                        )}

                        <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500">
                          <button
                            type="button"
                            onClick={() => handleLikeComment(comment.id)}
                            className={`inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-white cursor-pointer ${
                              comment.userLiked
                                ? "text-red-500 font-semibold"
                                : ""
                            }`}
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                            <span>{comment.likesCount || ""}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setReplyingToId(
                                replyingToId === comment.id ? null : comment.id
                              )
                            }
                            className="font-semibold hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                          >
                            Reply
                          </button>

                          {user && user.id === comment.userId && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCommentId(comment.id);
                                  setEditContent(comment.content);
                                }}
                                className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteComment(comment.id)}
                                className="inline-flex items-center gap-1 text-red-500 hover:underline cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Delete</span>
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => handleReportComment(comment.id)}
                            className="hover:text-red-500 cursor-pointer"
                          >
                            Report
                          </button>
                        </div>

                        {/* Reply Form */}
                        {replyingToId === comment.id && (
                          <form
                            onSubmit={(e) => handleAddComment(e, comment.id)}
                            className="mt-3 flex items-center gap-2"
                          >
                            <input
                              type="text"
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              placeholder={`Reply to @${comment.author.username}...`}
                              className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-xs"
                            />
                            <button
                              type="submit"
                              className="px-3 py-1.5 rounded-full bg-red-600 text-white text-xs font-semibold cursor-pointer"
                            >
                              Reply
                            </button>
                          </form>
                        )}

                        {/* Threaded Replies */}
                        {replies.length > 0 && (
                          <div className="mt-3 pl-4 border-l-2 border-zinc-200 dark:border-zinc-800 space-y-3">
                            {replies.map((reply) => (
                              <div
                                key={reply.id}
                                className="flex items-start gap-2.5"
                              >
                                <CornerDownRight className="w-3.5 h-3.5 text-zinc-400 mt-1 shrink-0" />
                                <UserAvatar
                                  name={reply.author.displayName}
                                  avatarUrl={reply.author.avatarUrl}
                                  size="xs"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="font-bold">
                                      @{reply.author.username}
                                    </span>
                                    <span className="text-zinc-500">
                                      {formatTimeAgo(reply.createdAt)}
                                    </span>
                                  </div>
                                  <p className="text-xs text-zinc-800 dark:text-zinc-200 mt-0.5">
                                    {reply.content}
                                  </p>
                                  <div className="flex items-center gap-3 mt-1 text-[11px] text-zinc-500">
                                    <button
                                      type="button"
                                      onClick={() => handleLikeComment(reply.id)}
                                      className={`inline-flex items-center gap-1 cursor-pointer ${
                                        reply.userLiked ? "text-red-500" : ""
                                      }`}
                                    >
                                      <ThumbsUp className="w-3 h-3" />
                                      <span>{reply.likesCount || ""}</span>
                                    </button>
                                    {user && user.id === reply.userId && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleDeleteComment(reply.id)
                                        }
                                        className="text-red-500 hover:underline cursor-pointer"
                                      >
                                        Delete
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Up Next / Related Real Videos */}
        <div className={`px-3 sm:px-0 ${theaterMode ? "w-full mt-6" : "lg:col-span-4"}`}>
          <h3 className="text-base font-bold mb-3">Up Next</h3>
          {relatedVideos.length === 0 ? (
            <div className="p-8 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 text-center text-xs text-zinc-500">
              No other public videos available yet.
            </div>
          ) : (
            <div className="space-y-2">
              {relatedVideos.map((rv) => (
                <VideoListItem key={rv.id} video={rv} compact />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
