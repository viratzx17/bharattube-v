import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Route handler for /api/activity.
 *
 * VERCEL BUILD REQUIREMENT:
 * This handler has ZERO dependencies on PostgreSQL, Drizzle, @/db, @/db/schema,
 * @/db/init, or DATABASE_URL. BharatTube uses the external deployed Node + Express + MongoDB
 * backend (https://bharattube-ylmq.onrender.com/api/v1).
 *
 * It safely proxies to the real backend endpoints or provides clean responses
 * without ever requiring an internal database.
 */

const BACKEND_BASE = (
  process.env.NEXT_PUBLIC_API_URL ||
  "https://bharattube-ylmq.onrender.com/api/v1"
).replace(/\/+$/, "");

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "notifications";
    const authHeader = req.headers.get("authorization") || "";
    const cookieHeader = req.headers.get("cookie") || "";

    const headers: Record<string, string> = {};
    if (authHeader) headers["Authorization"] = authHeader;
    if (cookieHeader) headers["Cookie"] = cookieHeader;

    if (type === "notifications") {
      try {
        const res = await fetch(`${BACKEND_BASE}/notifications`, {
          headers,
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data)
            ? data
            : Array.isArray(data.notifications)
            ? data.notifications
            : Array.isArray(data.data)
            ? data.data
            : [];
          const unreadCount =
            typeof data.unreadCount === "number"
              ? data.unreadCount
              : list.filter((n: { isRead?: boolean; read?: boolean }) => !n.isRead && !n.read).length;
          return NextResponse.json({ notifications: list, unreadCount });
        }
      } catch {
        // Backend offline or error
      }
      return NextResponse.json({ notifications: [], unreadCount: 0 });
    }

    if (type === "search") {
      const q = (searchParams.get("q") || "").trim();
      if (!q) {
        return NextResponse.json({
          videos: [],
          channels: [],
          playlists: [],
          searchHistory: [],
          suggestions: [],
        });
      }

      try {
        const res = await fetch(`${BACKEND_BASE}/search?q=${encodeURIComponent(q)}`, {
          headers,
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          const videos = Array.isArray(data.videos)
            ? data.videos
            : Array.isArray(data.data)
            ? data.data
            : Array.isArray(data)
            ? data
            : [];
          const channels = Array.isArray(data.channels) ? data.channels : [];
          const playlists = Array.isArray(data.playlists) ? data.playlists : [];
          return NextResponse.json({
            videos,
            channels,
            playlists,
            searchHistory: [],
            suggestions: [],
          });
        }
      } catch {
        // Backend offline or error
      }

      return NextResponse.json({
        videos: [],
        channels: [],
        playlists: [],
        searchHistory: [],
        suggestions: [],
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("GET /api/activity error:", err);
    return NextResponse.json({ notifications: [], unreadCount: 0 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // Empty or invalid body
    }

    const action = String(body.action || "");
    const authHeader = req.headers.get("authorization") || "";
    const cookieHeader = req.headers.get("cookie") || "";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authHeader) headers["Authorization"] = authHeader;
    if (cookieHeader) headers["Cookie"] = cookieHeader;

    if (action === "clear_watch_history") {
      try {
        await fetch(`${BACKEND_BASE}/history`, {
          method: "DELETE",
          headers,
        });
      } catch {
        // Safe fallback
      }
      return NextResponse.json({ success: true });
    }

    if (action === "remove_history_item") {
      const videoId = body.videoId;
      if (videoId) {
        try {
          await fetch(`${BACKEND_BASE}/history/${videoId}`, {
            method: "DELETE",
            headers,
          });
        } catch {
          // Safe fallback
        }
      }
      return NextResponse.json({ success: true });
    }

    if (action === "mark_all_notifications_read" || action === "mark_notification_read") {
      try {
        await fetch(`${BACKEND_BASE}/notifications/read`, {
          method: "PATCH",
          headers,
        });
      } catch {
        // Safe fallback
      }
      return NextResponse.json({ success: true });
    }

    // Search history recording/clearing (backend does not have a search-history route)
    if (action === "record_search" || action === "clear_search_history") {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/activity error:", err);
    return NextResponse.json({ success: true });
  }
}
