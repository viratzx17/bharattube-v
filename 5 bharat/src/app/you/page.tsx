"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User as UserIcon,
  ChevronRight,
  Film,
  Flame,
  Radio,
  ListVideo,
  History,
  ThumbsUp,
  Clock,
  Settings,
  LogOut,
  HelpCircle,
  Pencil,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserAvatar } from "@/components/VideoComponents";
import { formatCount } from "@/lib/format";
import { apiUrl } from "@/lib/api-config";

/** Compact navigation row used throughout the You hub. */
function YouRow({
  href,
  icon,
  title,
  subtitle,
  onClick,
  danger,
}: {
  href?: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  const className = `w-full flex items-center gap-3.5 px-4 py-3.5 text-left transition-colors cursor-pointer ${
    danger
      ? "hover:bg-red-500/5 text-red-500"
      : "hover:bg-zinc-100 dark:hover:bg-zinc-800/70 text-zinc-900 dark:text-zinc-100"
  }`;

  const body = (
    <>
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
          danger
            ? "bg-red-500/10 text-red-500"
            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
        }`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${danger ? "text-red-500" : ""}`}>
          {title}
        </div>
        {subtitle && (
          <div className="text-xs text-zinc-500 truncate mt-0.5">{subtitle}</div>
        )}
      </div>
      <ChevronRight
        className={`w-4 h-4 shrink-0 ${
          danger ? "text-red-400" : "text-zinc-400"
        }`}
      />
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
          {title}
        </h2>
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
        {children}
      </div>
    </section>
  );
}

function YouPage() {
  const { user, channel, logout, showToast } = useApp();
  const router = useRouter();
  const [counts, setCounts] = useState({
    videos: 0,
    shorts: 0,
    playlists: 0,
    history: 0,
    liked: 0,
    watchLater: 0,
  });
  const [signingOut, setSigningOut] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        const [myRes, histRes, likedRes, laterRes, plRes] = await Promise.all([
          fetch(apiUrl("/videos?feed=my_videos"), { cache: "no-store" }),
          fetch(apiUrl("/videos?feed=history"), { cache: "no-store" }),
          fetch(apiUrl("/videos?feed=liked"), { cache: "no-store" }),
          fetch(apiUrl("/videos?feed=watch_later"), { cache: "no-store" }),
          fetch(apiUrl("/playlists"), { cache: "no-store" }),
        ]);

        const my = myRes.ok ? await myRes.json() : { videos: [] };
        const hist = histRes.ok ? await histRes.json() : { videos: [] };
        const liked = likedRes.ok ? await likedRes.json() : { videos: [] };
        const later = laterRes.ok ? await laterRes.json() : { videos: [] };
        const pl = plRes.ok ? await plRes.json() : { playlists: [] };

        if (cancelled) return;

        const videos = my.videos || [];
        setCounts({
          videos: videos.filter((v: { isShort?: boolean }) => !v.isShort).length,
          shorts: videos.filter((v: { isShort?: boolean }) => v.isShort).length,
          playlists: (pl.playlists || []).length,
          history: (hist.videos || []).length,
          liked: (liked.videos || []).length,
          watchLater: (later.videos || []).length,
        });
      } catch {
        /* keep zeros — empty states handle this */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;

  const displayName = channel?.channelName || user.displayName;
  const handle = channel?.handle || user.username;
  const avatarUrl = channel?.profilePhotoUrl || user.avatarUrl;
  const subscriberCount = channel?.subscriberCount ?? user.subscriberCount ?? 0;

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
      setConfirmSignOut(false);
      router.replace("/");
    } catch {
      showToast("Could not sign out. Please try again.", "error");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 pb-8 space-y-4">
      {/* ===================== TOP ACCOUNT AREA ===================== */}
      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4">
        <div className="flex items-center gap-3.5">
          <UserAvatar
            name={displayName}
            avatarUrl={avatarUrl}
            size="lg"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <h1 className="text-base sm:text-lg font-bold truncate text-zinc-900 dark:text-white">
                {displayName}
              </h1>
              {user.isVerified && (
                <CheckCircle2 className="w-4 h-4 text-zinc-400 shrink-0" />
              )}
            </div>
            <div className="text-xs text-zinc-500 truncate">@{handle}</div>
            <div className="text-xs text-zinc-500 truncate">{user.email}</div>
            <div className="text-[11px] text-zinc-500 mt-1 tabular-nums">
              {formatCount(subscriberCount, "Subscriber", "Subscribers")}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Link
            href={`/channel/${user.id}`}
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-semibold text-zinc-900 dark:text-zinc-100 transition-colors"
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>Your channel</span>
          </Link>
          <Link
            href="/edit-channel"
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-full border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-900 dark:text-zinc-100 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Edit channel</span>
          </Link>
        </div>

        {!user.emailVerified && (
          <Link
            href="/settings"
            className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-600 dark:text-amber-400"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Email not verified — open Settings to verify</span>
            <ChevronRight className="w-3.5 h-3.5 ml-auto shrink-0" />
          </Link>
        )}
      </section>

      {/* ===================== YOUR CONTENT ===================== */}
      <Section title="Your content">
        <YouRow
          href="/my-videos"
          icon={<Film className="w-5 h-5" />}
          title="Your videos"
          subtitle={
            counts.videos === 0
              ? "No videos uploaded yet"
              : `${formatCount(counts.videos)} video${counts.videos === 1 ? "" : "s"}`
          }
        />
        <YouRow
          href="/my-videos?tab=shorts"
          icon={<Flame className="w-5 h-5" />}
          title="Shorts"
          subtitle={
            counts.shorts === 0
              ? "No Shorts yet"
              : `${formatCount(counts.shorts)} Short${counts.shorts === 1 ? "" : "s"}`
          }
        />
        <YouRow
          href={`/channel/${user.id}?tab=Live`}
          icon={<Radio className="w-5 h-5" />}
          title="Live"
          subtitle="Live streams and premieres"
        />
        <YouRow
          href="/playlists"
          icon={<ListVideo className="w-5 h-5" />}
          title="Playlists"
          subtitle={
            counts.playlists === 0
              ? "No playlists yet"
              : `${formatCount(counts.playlists)} playlist${counts.playlists === 1 ? "" : "s"}`
          }
        />
      </Section>

      {/* ===================== LIBRARY ===================== */}
      <Section title="Library">
        <YouRow
          href="/history"
          icon={<History className="w-5 h-5" />}
          title="History"
          subtitle={
            counts.history === 0
              ? "Videos you watch will appear here"
              : `${formatCount(counts.history)} in history`
          }
        />
        <YouRow
          href="/playlists"
          icon={<ListVideo className="w-5 h-5" />}
          title="Playlists"
          subtitle="Created and saved playlists"
        />
        <YouRow
          href="/liked"
          icon={<ThumbsUp className="w-5 h-5" />}
          title="Liked videos"
          subtitle={
            counts.liked === 0
              ? "No liked videos yet"
              : `${formatCount(counts.liked)} liked`
          }
        />
        <YouRow
          href="/watch-later"
          icon={<Clock className="w-5 h-5" />}
          title="Watch later"
          subtitle={
            counts.watchLater === 0
              ? "No videos saved for later"
              : `${formatCount(counts.watchLater)} saved`
          }
        />
      </Section>

      {/* ===================== ACCOUNT ===================== */}
      <Section title="Account">
        <YouRow
          href="/edit-profile"
          icon={<Pencil className="w-5 h-5" />}
          title="Edit profile"
          subtitle="Name, photo, handle and bio"
        />
        <YouRow
          href="/settings"
          icon={<Settings className="w-5 h-5" />}
          title="Settings"
          subtitle="Account, privacy, playback and more"
        />
      </Section>

      {/* ===================== SUPPORT + SIGN OUT ===================== */}
      <Section title="Support">
        <YouRow
          href="/settings"
          icon={<HelpCircle className="w-5 h-5" />}
          title="Help & feedback"
          subtitle="About BharatTube and support"
        />
      </Section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 overflow-hidden">
        <YouRow
          icon={<LogOut className="w-5 h-5" />}
          title="Sign out"
          subtitle="End your session on this device"
          danger
          onClick={() => setConfirmSignOut(true)}
        />
      </section>

      {/* Sign-out confirmation */}
      {confirmSignOut && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-5">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              Sign out?
            </h3>
            <p className="mt-1.5 text-sm text-zinc-500">
              You will need to sign in again to access your channel, library and
              uploads.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmSignOut(false)}
                disabled={signingOut}
                className="flex-1 py-2.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-sm font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex-1 py-2.5 rounded-full bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
              >
                {signingOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function YouPageRoute() {
  return (
    <ProtectedRoute
      title="Sign in to view your account"
      description="Your channel, library and settings are private to your signed-in account."
    >
      <YouPage />
    </ProtectedRoute>
  );
}
