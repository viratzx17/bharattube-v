"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Tv } from "lucide-react";
import {
  VideoCard,
  VideoItem,
  UserAvatar,
  SkeletonGrid,
  EmptyState,
} from "@/components/VideoComponents";
import { useApp } from "@/context/AppContext";
import { formatCount } from "@/lib/format";
import { apiUrl } from "@/lib/api-config";
import { channelHref } from "@/lib/backend-adapter";

interface SubscribedChannel {
  channelId: string | number;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  subscriberCount: number;
}

export default function SubscriptionsPage() {
  const { user, authStatus, openAuthModal, feedRefreshTrigger } = useApp();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [channels, setChannels] = useState<SubscribedChannel[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSubscriptions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/videos?feed=subscriptions"), {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setVideos(data.videos || []);
        setChannels(data.subscribedChannels || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions, user, feedRefreshTrigger]);

  if (authStatus === "loading") {
    return (
      <div className="max-w-[1700px] mx-auto px-6 py-16">
        <SkeletonGrid count={8} />
      </div>
    );
  }

  if (authStatus !== "authenticated" || !user) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <EmptyState
          title="No subscriptions yet"
          description="Sign in to subscribe to creators and see their latest video uploads here."
          actionLabel="Sign In"
          onAction={() => openAuthModal("login")}
          icon={<Tv className="w-7 h-7 text-red-500" />}
        />
      </div>
    );
  }

  return (
    <div className="max-w-[1700px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2.5">
          <Tv className="w-6 h-6 text-red-600" />
          <span>Subscriptions</span>
        </h1>
      </div>

      {loading ? (
        <SkeletonGrid count={8} />
      ) : channels.length === 0 ? (
        <EmptyState
          title="No subscriptions yet"
          description="Channels you subscribe to will appear here along with their latest public uploads."
          icon={<Tv className="w-7 h-7 text-zinc-400" />}
        />
      ) : (
        <div className="space-y-8">
          {/* Subscribed Channels Bar */}
          <div className="flex items-center gap-4 overflow-x-auto pb-3 border-b border-zinc-200 dark:border-zinc-800">
            {channels.map((ch) => (
              <Link
                key={ch.channelId}
                href={channelHref({ id: ch.channelId, username: ch.username })}
                className="flex items-center gap-3 px-3.5 py-2 rounded-2xl bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 shrink-0 transition-colors"
              >
                <UserAvatar
                  name={ch.displayName}
                  avatarUrl={ch.avatarUrl}
                  size="sm"
                />
                <div className="text-xs">
                  <div className="font-bold text-zinc-900 dark:text-zinc-100">
                    {ch.displayName}
                  </div>
                  <div className="text-zinc-500">
                    {formatCount(
                      ch.subscriberCount,
                      "Subscriber",
                      "Subscribers"
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Latest Uploads from Subscribed Channels */}
          {videos.length === 0 ? (
            <EmptyState
              title="No videos uploaded by your subscribed channels yet"
              description="As soon as the channels you subscribed to publish public videos, they will appear right here."
            />
          ) : (
            <div>
              <h2 className="text-base font-bold mb-4">Latest Uploads</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-8">
                {videos.map((v) => (
                  <VideoCard key={v.id} video={v} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
