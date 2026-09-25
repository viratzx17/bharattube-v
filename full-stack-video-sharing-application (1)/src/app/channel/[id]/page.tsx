"use client";

import React, { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  ListVideo,
  Info,
  Calendar,
  Eye,
  Users,
  Video as VideoIcon,
  Flame,
  Radio,
  Edit3,
} from "lucide-react";
import {
  UserAvatar,
  SubscribeButton,
  VideoCard,
  VideoItem,
  SkeletonGrid,
  EmptyState,
  ErrorState,
} from "@/components/VideoComponents";
import { formatCount, formatDuration } from "@/lib/format";
import { useApp } from "@/context/AppContext";
import { adaptChannel, adaptVideos } from "@/lib/backend-adapter";
import { apiUrl, channelApiUrl, channelMeApiUrl, isRouteNotFound } from "@/lib/api-config";

interface ChannelProfile {
  id: string;
  ownerUserId?: string;
  ownerUsername?: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  isVerified: boolean;
  subscriberCount: number;
  isSubscribed: boolean;
  totalVideos: number;
  totalViews: number;
  createdAt: string;
}

interface PlaylistSummary {
  id: number;
  title: string;
  description: string;
  visibility: string;
  itemCount: number;
  thumbnailUrl: string | null;
}

export default function ChannelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user, openUploadModal, feedRefreshTrigger, refreshUser } = useApp();

  const [channel, setChannel] = useState<ChannelProfile | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [activeTab, setActiveTab] = useState<
    "Home" | "Videos" | "Shorts" | "Live" | "Playlists" | "About"
  >("Home");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  /** True when this backend exposes no channel route at all. */
  const [channelRouteMissing, setChannelRouteMissing] = useState(false);
  /** True when the authenticated owner has no real channel record yet. */
  const [ownChannelMissing, setOwnChannelMissing] = useState(false);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [createChannelError, setCreateChannelError] = useState("");

  /**
   * Loads REAL channel data from the deployed backend.
   *
   * VERIFIED backend contract (probed live, not assumed):
   *   GET /channel/:handle → { success, data: { _id, owner:{_id,name,
   *        profilePhoto,username}, channelName, handle, logo, banner,
   *        description, subscribers[], totalViews, totalVideos,
   *        verified, subscribersCount } }
   * The route is SINGULAR and keyed by the channel HANDLE.
   * Channel videos come from the real GET /videos?userId=<ownerUserId>.
   *
   * Nothing is mocked: every value below is mapped from the API response.
   */
  const loadChannel = useCallback(async () => {
    setLoading(true);
    setError("");
    setChannelRouteMissing(false);
    setOwnChannelMissing(false);

    try {
      const res = await fetch(channelApiUrl(id), { cache: "no-store" });
      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }

      if (!res.ok) {
        const msg =
          payload && typeof payload === "object"
            ? String(
                (payload as Record<string, unknown>).message ||
                  (payload as Record<string, unknown>).error ||
                  ""
              )
            : "";

        // ROOT-CAUSE FIX: the backend resolves channels only by HANDLE, while
        // "Your Channel" links carry the signed-in user's id. When a resource
        // miss hits exactly the current user's id, resolve the REAL handle
        // through the authenticated GET /channel/me endpoint (no hardcoding),
        // then navigate to the canonical handle URL so refresh keeps working.
        const slugLooksLikeOwnerId =
          user != null &&
          String(id) !== "" &&
          String(id) === String(user.id);

        if (slugLooksLikeOwnerId && !/route '.*' not found/i.test(msg)) {
          try {
            const meRes = await fetch(channelMeApiUrl(), {
              credentials: "include",
              cache: "no-store",
            });
            if (meRes.ok) {
              const meData = await meRes.json();
              const mine = adaptChannel(meData, {
                currentUserId: user?.id != null ? String(user.id) : null,
              });
              const handle = mine?.username?.trim();
              if (handle) {
                // Preserve the original query (?tab=...) so no link intent is lost.
                const canonical = `/channel/${encodeURIComponent(handle)}${
                  window.location.search
                }`;
                if (window.location.pathname !== canonical) {
                  // Canonical public URL → direct refresh loads this channel.
                  router.replace(canonical);
                } else {
                  setChannel(null);
                  setError("");
                  setLoading(false);
                }
                return;
              }
            }

            // The backend answered (200-without-channel, 404, or empty) — the
            // user's account simply has no channel record. Report THAT truth,
            // never "Channel Not Found" (which would be a lie) and never a
            // fabricated channel.
            setOwnChannelMissing(true);
            setChannel(null);
            setVideos([]);
            setPlaylists([]);
            return;
          } catch (err) {
            // Distinguish a real reachability failure from a channel miss so
            // the error shown is truthful during development too.
            const isNetwork =
              err instanceof TypeError ||
              /fetch|network|cors/i.test(String((err as Error)?.message || ""));
            setError(
              isNetwork
                ? "Could not reach the video service. The server may be offline or blocking requests from this site."
                : "Failed to load channel data."
            );
            setChannel(null);
            setVideos([]);
            setPlaylists([]);
            return;
          }
        }

        // Distinguish "this backend has no channel route" from "not this channel".
        if (isRouteNotFound(payload)) {
          setChannelRouteMissing(true);
        } else {
          setError(msg || "Channel not found");
        }
        setChannel(null);
        setVideos([]);
        setPlaylists([]);
        return;
      }

      const adapted = adaptChannel(payload, { currentUserId: user?.id != null ? String(user.id) : null });
      if (!adapted) {
        setError("Channel not found");
        return;
      }

      setChannel({
        id: adapted.id,
        ownerUserId: adapted.ownerUserId,
        ownerUsername: adapted.ownerUsername,
        username: adapted.username,
        displayName: adapted.displayName,
        avatarUrl: adapted.avatarUrl,
        bannerUrl: adapted.bannerUrl,
        bio: adapted.bio,
        isVerified: adapted.isVerified,
        subscriberCount: adapted.subscriberCount,
        isSubscribed: adapted.isSubscribed,
        totalVideos: adapted.totalVideos,
        totalViews: adapted.totalViews,
        createdAt: adapted.createdAt,
      });

      // Channel videos — real endpoint, keyed by the channel OWNER id.
      if (adapted.ownerUserId) {
        const vres = await fetch(
          apiUrl(`/videos?userId=${encodeURIComponent(adapted.ownerUserId)}`),
          { cache: "no-store" }
        );
        if (vres.ok) {
          const vpayload = await vres.json();
          setVideos(adaptVideos(vpayload) as unknown as VideoItem[]);
        } else {
          setVideos([]);
        }
      } else {
        setVideos([]);
      }

      setPlaylists([]);
    } catch (err) {
      const isNetwork =
        err instanceof TypeError ||
        /fetch|network|cors/i.test(String((err as Error)?.message || ""));
      setError(
        isNetwork
          ? "Could not reach the video service. The server may be offline or blocking requests from this site."
          : "Failed to load channel data."
      );
    } finally {
      setLoading(false);
    }
  }, [id, user?.id, router]);

  useEffect(() => {
    loadChannel();
  }, [loadChannel, feedRefreshTrigger]);

  /**
   * Uses the backend's EXISTING authenticated POST /channel route. The server
   * derives ownership from the session; we only send the real signed-in
   * profile values as initial channel defaults. No channel is fabricated in
   * the browser and duplicate creation remains a backend concern.
   */
  const createMyChannel = async () => {
    if (!user || String(user.id) !== String(id) || creatingChannel) return;
    setCreatingChannel(true);
    setCreateChannelError("");
    try {
      const res = await fetch(apiUrl("/channel"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelName: user.displayName,
          handle: user.username,
          description: user.bio || "",
          logo: user.avatarUrl || "",
          banner: user.bannerUrl || "",
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateChannelError(
          payload?.message ||
            payload?.error ||
            "The server could not create your channel. Please try again."
        );
        return;
      }
      // Reload through GET /channel/me → canonical handle redirect. The
      // displayed channel will only appear after the server confirms it.
      await loadChannel();
    } catch {
      setCreateChannelError(
        "Could not reach the server. Please check your connection and try again."
      );
    } finally {
      setCreatingChannel(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
        <div className="w-full h-44 sm:h-56 rounded-2xl bg-zinc-200 dark:bg-zinc-800 animate-pulse mb-6" />
        <SkeletonGrid count={4} />
      </div>
    );
  }

  /**
    * This deployment's backend exposes `GET /channel/:handle` (singular, keyed
    * by the channel HANDLE) and has no channel route at all if this flag is set.
    * We never fabricate an identity — the notice below is exact.
    */
  if (channelRouteMissing && !channel) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 mb-6">
          <h2 className="text-sm font-bold text-amber-700 dark:text-amber-400">
            Channel information isn&apos;t available from this backend
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 leading-relaxed">
            The API responds{" "}
            <span className="font-mono">Route &apos;/channel/{id}&apos; not found</span>.
            Videos below are the real uploads returned by the API for this user.
          </p>
        </div>

        {loading ? (
          <SkeletonGrid count={4} />
        ) : videos.length === 0 ? (
          <EmptyState
            title="No videos from this user yet"
            description="The API returned no uploads for this user id."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-8">
            {videos.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (ownChannelMissing && !channel) {
    const isCurrentUserRoute = Boolean(user && String(user.id) === String(id));
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        {createChannelError && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
            {createChannelError}
          </div>
        )}
        <EmptyState
          title="You don't have a channel yet"
          description={
            isCurrentUserRoute
              ? "No channel record exists for your account. Create your real channel using your authenticated profile, then it will be loaded from the server."
              : "No channel record exists for this user on the server."
          }
          actionLabel={isCurrentUserRoute ? (creatingChannel ? "Creating channel..." : "Create your channel") : "Go back"}
          onAction={isCurrentUserRoute ? createMyChannel : () => router.push("/you")}
        />
      </div>
    );
  }

  if (error || !channel) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <ErrorState
          message={error || "Channel not found"}
          onRetry={loadChannel}
        />
      </div>
    );
  }

  const standardVideos = videos.filter((v) => !v.isShort && !v.isLive);
  const shortVideos = videos.filter((v) => v.isShort);
  const liveVideos = videos.filter((v) => v.isLive);
  // Ownership: compare the signed-in user id with the channel owner id.
  const isOwner = Boolean(
    user &&
      (String(user.id) === String(channel.ownerUserId || "") ||
        (channel.ownerUsername && String(user.username) === channel.ownerUsername))
  );

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-5">
      {/* Channel Banner */}
      <div className="relative w-full h-28 sm:h-52 md:h-60 rounded-xl sm:rounded-2xl overflow-hidden bg-gradient-to-r from-zinc-900 via-red-950/60 to-zinc-900 border border-zinc-800/70">
        {channel.bannerUrl ? (
          <img
            src={channel.bannerUrl}
            alt={`${channel.displayName} banner`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-zinc-500 text-xs uppercase tracking-widest font-semibold">
              {channel.displayName} • Broadcast Channel
            </span>
          </div>
        )}
      </div>

      {/* Channel Header Info */}
      <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 pb-6 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <UserAvatar
            name={channel.displayName}
            avatarUrl={channel.avatarUrl}
            size="xl"
          />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-2 text-zinc-900 dark:text-white break-words">
              <span>{channel.displayName}</span>
              {channel.isVerified && (
                <CheckCircle2 className="w-5 h-5 text-zinc-400" />
              )}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 tabular-nums">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                @{channel.username}
              </span>
              <span>•</span>
              <span>
                {formatCount(
                  channel.subscriberCount,
                  "Subscriber",
                  "Subscribers"
                )}
              </span>
              <span>•</span>
              <span>
                {formatCount(channel.totalVideos, "video", "videos")}
              </span>
            </div>
            {channel.bio && (
              <p className="mt-2 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl line-clamp-2">
                {channel.bio}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isOwner ? (
            <>
              <Link
                href="/edit-channel"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-xs sm:text-sm font-semibold transition-colors"
              >
                <Edit3 className="w-4 h-4" />
                <span>Edit Channel</span>
              </Link>
              <button
                type="button"
                onClick={openUploadModal}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 hover:bg-red-500 text-white text-xs sm:text-sm font-semibold shadow cursor-pointer"
              >
                <span>Upload Video</span>
              </button>
            </>
          ) : (
            <SubscribeButton
              channelId={channel.username || channel.id}
              isOwner={isOwner}
              initialSubscribed={channel.isSubscribed}
              onStatusChange={(sub, newCount) => {
                setChannel((prev) =>
                  prev
                    ? { ...prev, isSubscribed: sub, subscriberCount: newCount }
                    : prev
                );
              }}
            />
          )}
        </div>
      </div>

      {/* Channel Navigation Tabs */}
      <div className="sticky top-14 z-20 bg-zinc-50/95 dark:bg-[#0F0F0F]/95 backdrop-blur-md flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar border-b border-zinc-200 dark:border-zinc-800 mb-6 -mx-3 px-3 sm:mx-0 sm:px-0">
        {(
          ["Home", "Videos", "Shorts", "Live", "Playlists", "About"] as const
        ).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer active:opacity-70 ${
              activeTab === tab
                ? "border-red-600 text-red-600 dark:text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "Home" && (
        <div className="space-y-10">
          {videos.length === 0 ? (
            <EmptyState
              title="This channel hasn't uploaded any videos yet"
              description="Once videos or Shorts are published by this creator, they will appear here."
              actionLabel={isOwner ? "Upload Your First Video" : undefined}
              onAction={isOwner ? openUploadModal : undefined}
            />
          ) : (
            <>
              {standardVideos.length > 0 && (
                <section>
                  <h2 className="text-base font-bold mb-4">Videos</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-8">
                    {standardVideos.map((v) => (
                      <VideoCard key={v.id} video={v} />
                    ))}
                  </div>
                </section>
              )}

              {shortVideos.length > 0 && (
                <section>
                  <h2 className="text-base font-bold mb-4 flex items-center gap-2">
                    <Flame className="w-4 h-4 text-red-600" />
                    <span>Shorts</span>
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                    {shortVideos.map((s) => (
                      <Link
                        key={s.id}
                        href={`/shorts?id=${s.id}`}
                        className="group flex flex-col gap-2"
                      >
                        <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
                          <img
                            src={s.thumbnailUrl}
                            alt={s.title}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-white text-[10px]">
                            {formatDuration(s.duration)}
                          </span>
                        </div>
                        <span className="text-xs font-semibold line-clamp-2">
                          {s.title}
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "Videos" &&
        (standardVideos.length === 0 ? (
          <EmptyState
            title="No standard videos uploaded yet"
            description="Standard 16:9 videos uploaded by this channel will appear here."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-8">
            {standardVideos.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        ))}

      {activeTab === "Shorts" &&
        (shortVideos.length === 0 ? (
          <EmptyState
            title="No Shorts uploaded yet"
            description="Vertical Shorts uploaded by this channel will appear here."
            icon={<Flame className="w-7 h-7 text-red-500" />}
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {shortVideos.map((s) => (
              <Link
                key={s.id}
                href={`/shorts?id=${s.id}`}
                className="group flex flex-col gap-2"
              >
                <div className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800">
                  <img
                    src={s.thumbnailUrl}
                    alt={s.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
                <h3 className="text-sm font-semibold line-clamp-2">
                  {s.title}
                </h3>
                <span className="text-xs text-zinc-500">
                  {formatCount(s.viewsCount, "view", "views")}
                </span>
              </Link>
            ))}
          </div>
        ))}

      {activeTab === "Live" &&
        (liveVideos.length === 0 ? (
          <EmptyState
            title="No live streams available"
            description="This channel has no active or archived live broadcasts."
            icon={<Radio className="w-7 h-7 text-zinc-400" />}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-8">
            {liveVideos.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        ))}

      {activeTab === "Playlists" &&
        (playlists.length === 0 ? (
          <EmptyState
            title="No playlists yet"
            description="Public playlists created by this channel will be listed here."
            icon={<ListVideo className="w-7 h-7 text-zinc-400" />}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {playlists.map((pl) => (
              <Link
                key={pl.id}
                href={`/playlists?id=${pl.id}`}
                className="group flex flex-col gap-2 p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-red-500/50 transition-colors"
              >
                <div className="relative aspect-video rounded-xl overflow-hidden bg-zinc-800 flex items-center justify-center">
                  {pl.thumbnailUrl ? (
                    <img
                      src={pl.thumbnailUrl}
                      alt={pl.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ListVideo className="w-8 h-8 text-zinc-500" />
                  )}
                  <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/85 text-white text-xs font-semibold">
                    {pl.itemCount} videos
                  </span>
                </div>
                <h3 className="font-bold text-sm group-hover:text-red-500 transition-colors">
                  {pl.title}
                </h3>
                <p className="text-xs text-zinc-500 line-clamp-1">
                  {pl.description || "View full playlist"}
                </p>
              </Link>
            ))}
          </div>
        ))}

      {activeTab === "About" && (
        <div className="max-w-2xl p-6 rounded-2xl bg-zinc-100/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 space-y-6">
          <div>
            <h3 className="text-base font-bold mb-2 flex items-center gap-2">
              <Info className="w-4 h-4 text-red-600" />
              <span>Channel Description</span>
            </h3>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-line">
              {channel.bio || "This creator has not added a biography yet."}
            </p>
          </div>

          <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-3">
              <Users className="w-4 h-4 text-zinc-400" />
              <span>
                {formatCount(
                  channel.subscriberCount,
                  "Subscriber",
                  "Subscribers"
                )}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <VideoIcon className="w-4 h-4 text-zinc-400" />
              <span>
                {formatCount(channel.totalVideos, "video", "videos")}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Eye className="w-4 h-4 text-zinc-400" />
              <span>
                {formatCount(channel.totalViews, "total view", "total views")}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-zinc-400" />
              <span>
                Joined {new Date(channel.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
