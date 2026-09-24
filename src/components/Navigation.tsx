"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  Search,
  Bell,
  Plus,
  Home,
  Flame,
  Tv,
  History,
  ListVideo,
  ThumbsUp,
  Clock,
  Film,
  User,
  LogOut,
  Edit3,
  Sun,
  Moon,
  Monitor,
  CheckCheck,
  X,
  Settings,
} from "lucide-react";
import { useApp, ThemeMode } from "@/context/AppContext";
import { UserAvatar } from "./VideoComponents";
import { BrandLogo } from "./BrandLogo";
import { formatTimeAgo } from "@/lib/format";
import { apiUrl } from "@/lib/api-config";

interface NotificationRecord {
  id: number;
  type: string;
  title: string;
  message: string;
  link: string;
  isRead: boolean;
  createdAt: string;
  actor?: {
    id: number;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { sidebarExpanded } = useApp();

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-[#0F0F0F] text-zinc-900 dark:text-[#F1F1F1] transition-colors">
      <TopNavbar />
      <div className="flex flex-1 pt-14 pb-nav md:pb-0">
        <DesktopSidebar />
        <main
          className={`flex-1 min-w-0 transition-all duration-200 ${
            sidebarExpanded ? "md:pl-60" : "md:pl-[72px]"
          }`}
        >
          {children}
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}

function TopNavbar() {
  const {
    user,
    theme,
    setTheme,
    setSidebarExpanded,
    unreadCount,
    refreshNotifications,
    hasAccounts,
    openAuthModal,
    openUploadModal,
    logout,
  } = useApp();

  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notificationsList, setNotificationsList] = useState<
    NotificationRecord[]
  >([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);

  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setSearchFocused(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const loadSearchSuggestions = async () => {
    try {
      const res = await fetch(apiUrl("/activity?type=search"));
      if (res.ok) {
        const data = await res.json();
        setSearchHistory(data.searchHistory || []);
        setSuggestions(data.suggestions || []);
      }
    } catch {
      // ignore
    }
  };

  const handleSearchSubmit = async (e?: React.FormEvent, qOverride?: string) => {
    e?.preventDefault();
    const q = (qOverride !== undefined ? qOverride : searchQuery).trim();
    setSearchFocused(false);
    if (!q) return;

    if (user) {
      fetch(apiUrl("/activity"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "record_search", query: q }),
      }).catch(() => {});
    }
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const handleClearSearchHistory = async () => {
    await fetch(apiUrl("/activity"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear_search_history" }),
    });
    setSearchHistory([]);
  };

  const openNotificationCenter = async () => {
    setNotifOpen((o) => !o);
    if (!notifOpen && user) {
      setLoadingNotifs(true);
      try {
        const res = await fetch(apiUrl("/activity?type=notifications"));
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data)
            ? data
            : Array.isArray(data.notifications)
            ? data.notifications
            : Array.isArray(data.data)
            ? data.data
            : [];
          setNotificationsList(list);
        }
      } finally {
        setLoadingNotifs(false);
      }
    }
  };

  const markSingleRead = async (id: number, link: string) => {
    await fetch(apiUrl("/activity"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "mark_notification_read",
        notificationId: id,
      }),
    });
    setNotificationsList((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    await refreshNotifications();
    setNotifOpen(false);
    router.push(link);
  };

  const markAllRead = async () => {
    await fetch(apiUrl("/activity"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_notifications_read" }),
    });
    setNotificationsList((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await refreshNotifications();
  };

  return (
    <header className="fixed top-0 inset-x-0 h-14 z-40 bg-white/95 dark:bg-[#0F0F0F]/95 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800/80 px-2 sm:px-5 px-safe flex items-center justify-between gap-1.5 sm:gap-3">
      {/* Left: Hamburger + Brand Logo */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <button
          type="button"
          onClick={() => setSidebarExpanded((prev) => !prev)}
          className="hidden md:inline-flex p-2 rounded-full hover:bg-zinc-200/70 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          aria-label="Toggle navigation sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        <Link href="/" className="flex items-center gap-2 group" aria-label="BharatTube home">
          <BrandLogo size={30} className="shrink-0 drop-shadow-sm transition-transform group-hover:scale-105" />
          <span className="font-bold text-lg tracking-tight text-zinc-900 dark:text-white">
            Bharat<span className="text-red-600">Tube</span>
          </span>
        </Link>
      </div>

      {/* Center: Search Bar + Autocomplete & History */}
      <div
        ref={searchContainerRef}
        className="hidden md:block flex-1 max-w-xl mx-2 relative"
      >
        <form
          onSubmit={(e) => handleSearchSubmit(e)}
          className="flex items-center w-full rounded-full bg-zinc-100 dark:bg-[#121212] border border-zinc-300 dark:border-zinc-800 focus-within:border-red-500 dark:focus-within:border-red-500 overflow-hidden"
        >
          <input
            type="text"
            value={searchQuery}
            onFocus={() => {
              setSearchFocused(true);
              loadSearchSuggestions();
            }}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search videos, channels, or playlists..."
            className="w-full px-4 py-2 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="submit"
            aria-label="Search"
            className="px-4 py-2 bg-zinc-200/80 dark:bg-zinc-800/90 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border-l border-zinc-300 dark:border-zinc-800 cursor-pointer"
          >
            <Search className="w-4 h-4" />
          </button>
        </form>

        {/* Search Dropdown: History & Suggestions */}
        {searchFocused &&
          (searchHistory.length > 0 || suggestions.length > 0) && (
            <div className="absolute left-0 right-0 top-11 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl py-2 z-50 text-sm">
              {searchHistory.length > 0 && (
                <div className="mb-1">
                  <div className="flex items-center justify-between px-4 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    <span>Recent Searches</span>
                    <button
                      type="button"
                      onClick={handleClearSearchHistory}
                      className="text-red-500 hover:underline cursor-pointer"
                    >
                      Clear history
                    </button>
                  </div>
                  {searchHistory.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setSearchQuery(item);
                        handleSearchSubmit(undefined, item);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 cursor-pointer"
                    >
                      <History className="w-4 h-4 text-zinc-400" />
                      <span className="truncate">{item}</span>
                    </button>
                  ))}
                </div>
              )}

              {suggestions.length > 0 && (
                <div>
                  <div className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Suggested Videos
                  </div>
                  {suggestions.map((sug, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setSearchQuery(sug);
                        handleSearchSubmit(undefined, sug);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 cursor-pointer"
                    >
                      <Search className="w-4 h-4 text-zinc-400" />
                      <span className="truncate">{sug}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
      </div>

      {/* Right: Search (mobile) + Upload + Notifications + User Menu */}
      <div className="flex items-center gap-0.5 sm:gap-3 shrink-0">
        <Link
          href="/search"
          aria-label="Search"
          className="md:hidden tap-target inline-flex items-center justify-center rounded-full text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200/70 dark:hover:bg-zinc-800 active:bg-zinc-300/70 dark:active:bg-zinc-700 transition-colors"
        >
          <Search className="w-5 h-5" />
        </Link>

        <button
          type="button"
          onClick={openUploadModal}
          aria-label="Create — upload a video"
          className="tap-target inline-flex items-center justify-center sm:gap-1.5 sm:px-3.5 sm:py-1.5 sm:w-auto rounded-full sm:bg-zinc-200/80 sm:dark:bg-zinc-800 hover:bg-zinc-200/70 dark:hover:bg-zinc-800 active:bg-zinc-300/70 text-zinc-900 dark:text-zinc-100 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
        >
          <Plus className="w-5 h-5 sm:w-4 sm:h-4 text-red-600" />
          <span className="hidden sm:inline">Create</span>
        </button>

        {/* Notification Center */}
        <div ref={notifRef} className="relative">
          <button
            type="button"
            onClick={openNotificationCenter}
            aria-label={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : "Notifications"
            }
            aria-expanded={notifOpen}
            className="relative tap-target inline-flex items-center justify-center rounded-full hover:bg-zinc-200/70 dark:hover:bg-zinc-800 active:bg-zinc-300/70 dark:active:bg-zinc-700 transition-colors cursor-pointer"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 top-16 sm:top-11 w-auto sm:w-96 max-w-[calc(100vw-1rem)] rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
                <span className="font-bold text-sm">Notifications</span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="inline-flex items-center gap-1 text-xs text-red-500 hover:underline font-medium cursor-pointer"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Mark all as read</span>
                  </button>
                )}
              </div>

              <div className="max-h-[70vh] sm:max-h-96 overflow-y-auto overscroll-contain divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                {!user ? (
                  <div className="p-8 text-center text-xs text-zinc-500">
                    Sign in to view your notifications.
                  </div>
                ) : loadingNotifs ? (
                  <div className="p-8 text-center text-xs text-zinc-500">
                    Loading notifications...
                  </div>
                ) : notificationsList.length === 0 ? (
                  <div className="p-10 text-center">
                    <Bell className="w-8 h-8 text-zinc-400 mx-auto mb-2 opacity-60" />
                    <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                      No notifications
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                      Activity from your subscriptions, comments, and likes will
                      appear here.
                    </p>
                  </div>
                ) : (
                  notificationsList.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => markSingleRead(n.id, n.link)}
                      className={`w-full flex items-start gap-3 p-3.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer ${
                        !n.isRead ? "bg-red-500/5" : ""
                      }`}
                    >
                      <UserAvatar
                        name={n.actor?.displayName || "A"}
                        avatarUrl={n.actor?.avatarUrl}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {n.title}
                        </div>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 mt-0.5">
                          {n.message}
                        </p>
                        <div className="text-[11px] text-zinc-400 mt-1">
                          {formatTimeAgo(n.createdAt)}
                        </div>
                      </div>
                      {!n.isRead && (
                        <span className="w-2 h-2 rounded-full bg-red-600 mt-1.5 shrink-0" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile / Sign-in Button */}
        {user ? (
          <div ref={userMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen((o) => !o)}
              aria-label="Account menu"
              aria-expanded={userMenuOpen}
              className="tap-target flex items-center justify-center rounded-full cursor-pointer"
            >
              <UserAvatar
                name={user.displayName}
                avatarUrl={user.avatarUrl}
                size="sm"
              />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-11 w-64 max-w-[calc(100vw-1rem)] max-h-[75vh] overflow-y-auto overscroll-contain rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl py-2 z-50 text-sm">
                <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
                  <UserAvatar
                    name={user.displayName}
                    avatarUrl={user.avatarUrl}
                    size="md"
                  />
                  <div className="min-w-0">
                    <div className="font-bold truncate text-zinc-900 dark:text-white">
                      {user.displayName}
                    </div>
                    <div className="text-xs text-zinc-500 truncate">
                      @{user.username}
                    </div>
                  </div>
                </div>

                <div className="py-1">
                  <Link
                    href={`/channel/${user.id}`}
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
                  >
                    <User className="w-4 h-4 text-zinc-400" />
                    <span>Your Channel</span>
                  </Link>
                  <Link
                    href="/you"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
                  >
                    <User className="w-4 h-4 text-zinc-400" />
                    <span>You</span>
                  </Link>
                  <Link
                    href="/edit-channel"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
                  >
                    <Edit3 className="w-4 h-4 text-zinc-400" />
                    <span>Edit channel</span>
                  </Link>
                  <Link
                    href="/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
                  >
                    <Settings className="w-4 h-4 text-zinc-400" />
                    <span>Settings</span>
                  </Link>
                  <Link
                    href="/my-videos"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
                  >
                    <Film className="w-4 h-4 text-zinc-400" />
                    <span>Creator Studio Videos</span>
                  </Link>
                </div>

                {/* Theme Mode Switcher */}
                <div className="px-4 py-2.5 border-t border-zinc-200 dark:border-zinc-800">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                    Appearance ({theme})
                  </div>
                  <div className="grid grid-cols-3 gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
                    {[
                      { id: "light", label: "Light", icon: Sun },
                      { id: "dark", label: "Dark", icon: Moon },
                      { id: "system", label: "System", icon: Monitor },
                    ].map((t) => {
                      const Icon = t.icon;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTheme(t.id as ThemeMode)}
                          className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                            theme === t.id
                              ? "bg-white dark:bg-zinc-900 text-red-600 shadow-sm"
                              : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span>{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-zinc-200 dark:border-zinc-800 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-left text-red-500 hover:bg-red-500/10 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => openAuthModal()}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-red-600 dark:text-red-400 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
          >
            <User className="w-4 h-4" />
            <span>{hasAccounts ? "Sign in" : "Create account"}</span>
          </button>
        )}
      </div>
    </header>
  );
}

function DesktopSidebar() {
  const pathname = usePathname();
  const { sidebarExpanded } = useApp();

  const primaryLinks = [
    { href: "/", label: "Home", icon: Home },
    { href: "/shorts", label: "Shorts", icon: Flame },
    { href: "/subscriptions", label: "Subscriptions", icon: Tv },
  ];

  const libraryLinks = [
    { href: "/you", label: "You", icon: User },
    { href: "/history", label: "History", icon: History },
    { href: "/playlists", label: "Playlists", icon: ListVideo },
    { href: "/liked", label: "Liked videos", icon: ThumbsUp },
    { href: "/watch-later", label: "Watch Later", icon: Clock },
    { href: "/my-videos", label: "Your videos", icon: Film },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  if (!sidebarExpanded) {
    return (
      <aside className="hidden md:flex flex-col items-center fixed top-14 left-0 bottom-0 w-[72px] bg-white dark:bg-[#0F0F0F] border-r border-zinc-200/70 dark:border-zinc-800/70 py-3 gap-1 z-30">
        {[...primaryLinks, { href: "/you", label: "You", icon: User }].map(
          (item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center w-14 py-3 rounded-xl text-[10px] font-medium gap-1 transition-colors ${
                  active
                    ? "bg-zinc-200/80 dark:bg-zinc-800 text-red-600 dark:text-white font-semibold"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="truncate max-w-full px-1">{item.label}</span>
              </Link>
            );
          }
        )}
      </aside>
    );
  }

  return (
    <aside className="hidden md:flex flex-col fixed top-14 left-0 bottom-0 w-60 bg-white dark:bg-[#0F0F0F] border-r border-zinc-200/70 dark:border-zinc-800/70 px-3 py-3 overflow-y-auto z-30">
      <div className="space-y-1">
        {primaryLinks.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-4 px-3.5 py-2.5 rounded-xl text-sm transition-colors ${
                active
                  ? "bg-zinc-200/80 dark:bg-zinc-800 text-zinc-950 dark:text-white font-semibold"
                  : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              }`}
            >
              <Icon
                className={`w-5 h-5 ${
                  active ? "text-red-600" : "text-zinc-500 dark:text-zinc-400"
                }`}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="my-3 border-t border-zinc-200 dark:border-zinc-800" />

      <div className="px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-zinc-400">
        Library & You
      </div>
      <div className="space-y-1 mt-1">
        {libraryLinks.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-4 px-3.5 py-2.5 rounded-xl text-sm transition-colors ${
                active
                  ? "bg-zinc-200/80 dark:bg-zinc-800 text-zinc-950 dark:text-white font-semibold"
                  : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              }`}
            >
              <Icon
                className={`w-5 h-5 ${
                  active ? "text-red-600" : "text-zinc-500 dark:text-zinc-400"
                }`}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

function MobileBottomNav() {
  const pathname = usePathname();
  const { openUploadModal } = useApp();

  const items = [
    { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
    {
      href: "/shorts",
      label: "Shorts",
      icon: Flame,
      match: (p: string) => p.startsWith("/shorts"),
    },
    {
      href: "/subscriptions",
      label: "Subs",
      icon: Tv,
      match: (p: string) => p.startsWith("/subscriptions"),
    },
    {
      href: "/you",
      label: "You",
      icon: User,
      // Library screens are reached from You, so keep the tab lit there too.
      match: (p: string) =>
        ["/you", "/history", "/liked", "/watch-later", "/playlists", "/my-videos", "/settings", "/edit-profile", "/edit-channel"].some(
          (r) => p === r || p.startsWith(`${r}/`)
        ),
    },
  ];

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-[#0F0F0F]/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 pb-safe px-safe"
    >
      <div className="h-14 flex items-stretch justify-around">
        {items.slice(0, 2).map((item) => (
          <NavTab key={item.href} item={item} pathname={pathname} />
        ))}

        <button
          type="button"
          onClick={openUploadModal}
          aria-label="Create — upload a video"
          className="flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 text-[10px] font-medium text-zinc-600 dark:text-zinc-300 active:scale-95 transition-transform cursor-pointer"
        >
          <span className="w-10 h-6 rounded-full bg-red-600 text-white flex items-center justify-center shadow-sm">
            <Plus className="w-5 h-5" />
          </span>
          <span className="truncate">Create</span>
        </button>

        {items.slice(2).map((item) => (
          <NavTab key={item.href} item={item} pathname={pathname} />
        ))}
      </div>
    </nav>
  );
}

function NavTab({
  item,
  pathname,
}: {
  item: {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    match: (p: string) => boolean;
  };
  pathname: string;
}) {
  const Icon = item.icon;
  const active = item.match(pathname);
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={`flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 text-[10px] font-medium active:scale-95 transition-transform ${
        active
          ? "text-red-600 dark:text-red-500 font-semibold"
          : "text-zinc-600 dark:text-zinc-400"
      }`}
    >
      <Icon className="w-5 h-5 shrink-0" />
      <span className="truncate max-w-full px-0.5">{item.label}</span>
    </Link>
  );
}
