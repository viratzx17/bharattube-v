"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  Subtitles,
  RectangleHorizontal,
  RotateCcw,
} from "lucide-react";
import { formatDuration } from "@/lib/format";
import { apiUrl } from "@/lib/api-config";
import { useApp } from "@/context/AppContext";

interface VideoPlayerProps {
  videoId: string | number;
  videoUrl: string;
  thumbnailUrl: string;
  title: string;
  initialDuration?: number;
  savedProgressSeconds?: number;
  theaterMode: boolean;
  onToggleTheater: () => void;
  onViewsUpdated?: (newViewsCount: number) => void;
  /** Account playback preferences (Settings → Playback). */
  autoPlay?: boolean;
  initialPlaybackRate?: number;
  initialCaptions?: boolean;
}

export function VideoPlayer({
  videoId,
  videoUrl,
  thumbnailUrl,
  title,
  initialDuration = 0,
  savedProgressSeconds = 0,
  theaterMode,
  onToggleTheater,
  onViewsUpdated,
  autoPlay = false,
  initialPlaybackRate = 1,
  initialCaptions = false,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(initialPlaybackRate || 1);
  const [quality, setQuality] = useState("Auto (Source)");
  const [captionsEnabled, setCaptionsEnabled] = useState(Boolean(initialCaptions));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resumedBanner, setResumedBanner] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const { user } = useApp();

  const watchedSecondsRef = useRef(0);
  const lastPositionRef = useRef(0);
  const lastProgressSentRef = useRef(0);

  // Apply saved account preferences to the media element.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = initialPlaybackRate || 1;
    if (autoPlay) {
      v.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  }, [autoPlay, initialPlaybackRate]);

  // Resume from saved progress when metadata loads
  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.duration && !Number.isNaN(v.duration) && Number.isFinite(v.duration)) {
      setDuration(v.duration);
    }
    if (
      savedProgressSeconds > 2 &&
      savedProgressSeconds < (v.duration || initialDuration) - 3
    ) {
      v.currentTime = savedProgressSeconds;
      setCurrentTime(savedProgressSeconds);
      setResumedBanner(true);
      setTimeout(() => setResumedBanner(false), 4000);
    }
  };

  const reportProgress = useCallback(
    async (currPos: number, dur: number) => {
      if (!user || !dur || watchedSecondsRef.current <= 0) return;

      try {
        const res = await fetch(apiUrl(`/history/${encodeURIComponent(String(videoId))}`), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            watchedDuration: watchedSecondsRef.current,
            currentTime: Math.max(0, Math.min(currPos, dur)),
            duration: dur,
            completed: watchedSecondsRef.current / dur >= 0.95,
          }),
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const counted = Boolean(data?.viewCounted ?? data?.data?.viewCounted);
          if (counted) {
            // The backend is authoritative; refresh the video's view count
            // instead of incrementing it locally.
            const videoRes = await fetch(apiUrl(`/videos/${encodeURIComponent(String(videoId))}`), {
              cache: "no-store",
            });
            if (videoRes.ok) {
              const payload = await videoRes.json().catch(() => ({}));
              const latest = payload?.data ?? payload?.video ?? payload;
              const views = Number(latest?.views);
              if (Number.isFinite(views)) onViewsUpdated?.(views);
            }
          }
        }
      } catch {
        // Telemetry must never interrupt playback.
      }
    },
    [videoId, user, onViewsUpdated]
  );

  // Count only genuine forward playback deltas. Seeking, paused time and
  // background time are not added to watchedDuration.
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      const v = videoRef.current;
      if (!v || v.paused || v.seeking) return;

      const current = Math.max(0, Number(v.currentTime) || 0);
      const previous = lastPositionRef.current;
      const delta = current - previous;

      if (delta > 0 && delta <= 2.5) {
        watchedSecondsRef.current += delta;
      }
      lastPositionRef.current = current;

      const now = Date.now();
      if (now - lastProgressSentRef.current >= 4000) {
        lastProgressSentRef.current = now;
        void reportProgress(current, v.duration || duration || initialDuration || 1);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, duration, initialDuration, reportProgress]);


  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      lastPositionRef.current = v.currentTime;
      v.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    } else {
      v.pause();
      setIsPlaying(false);
      void reportProgress(v.currentTime, v.duration || duration || initialDuration || 1);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    const newTime = Number(e.target.value);
    setCurrentTime(newTime);
    if (v) {
      v.currentTime = newTime;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    const val = Number(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    if (v) {
      v.volume = val;
      v.muted = val === 0;
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    v.muted = nextMuted;
  };

  const changeSpeed = (rate: number) => {
    const v = videoRef.current;
    setPlaybackRate(rate);
    if (v) {
      v.playbackRate = rate;
    }
    setSettingsOpen(false);
  };

  const toggleFullscreen = () => {
    const el = containerRef.current as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void })
      | null;
    const video = videoRef.current as
      | (HTMLVideoElement & {
          webkitEnterFullscreen?: () => void;
          webkitSupportsFullscreen?: boolean;
        })
      | null;
    if (!el) return;

    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };

    const isFs = Boolean(document.fullscreenElement || doc.webkitFullscreenElement);

    if (!isFs) {
      if (typeof el.requestFullscreen === "function") {
        el.requestFullscreen()
          .then(() => setIsFullscreen(true))
          .catch(() => {});
      } else if (typeof el.webkitRequestFullscreen === "function") {
        el.webkitRequestFullscreen();
        setIsFullscreen(true);
      } else if (video?.webkitEnterFullscreen) {
        // iPhone Safari only allows fullscreen on the <video> element itself.
        video.webkitEnterFullscreen();
      }
    } else if (typeof document.exitFullscreen === "function") {
      document.exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    } else if (typeof doc.webkitExitFullscreen === "function") {
      doc.webkitExitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Keep icon state in sync when the user exits fullscreen with a gesture.
  useEffect(() => {
    const sync = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      setIsFullscreen(Boolean(document.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  const effectiveDuration = Math.max(duration || initialDuration || 1, 1);
  const progressPercent = Math.min(
    100,
    Math.max(0, (currentTime / effectiveDuration) * 100)
  );

  return (
    <div
      ref={containerRef}
      className={`relative group bg-black rounded-2xl overflow-hidden select-none border border-zinc-800/80 shadow-2xl ${
        theaterMode ? "w-full aspect-video max-h-[78vh]" : "w-full aspect-video"
      }`}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        poster={thumbnailUrl}
        playsInline
        onClick={togglePlay}
        onLoadedMetadata={handleLoadedMetadata}
        onSeeking={() => { lastPositionRef.current = videoRef.current?.currentTime || 0; }}
        onTimeUpdate={() => {
          if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
          }
        }}
        onPlay={() => { lastPositionRef.current = videoRef.current?.currentTime || 0; setIsPlaying(true); }}
        onPause={() => setIsPlaying(false)}
        onError={() => setMediaError(true)}
        onEnded={() => {
          setIsPlaying(false);
          if (videoRef.current) {
            void reportProgress(
              videoRef.current.currentTime,
              videoRef.current.duration || effectiveDuration
            );
          }
        }}
        className="w-full h-full object-contain cursor-pointer"
      />

      {/* Resumed from Watch Progress Notification */}
      {resumedBanner && (
        <div className="absolute top-4 left-4 px-3.5 py-1.5 rounded-lg bg-black/80 border border-zinc-700 text-xs text-zinc-200 flex items-center gap-2 backdrop-blur-md">
          <RotateCcw className="w-3.5 h-3.5 text-red-500" />
          <span>Resumed from {formatDuration(savedProgressSeconds)}</span>
        </div>
      )}

      {/* Captions Overlay */}
      {captionsEnabled && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded bg-black/85 text-white text-sm font-medium text-center max-w-[85%] pointer-events-none border border-zinc-700/60">
          [CC] {title} — ({formatDuration(currentTime)})
        </div>
      )}

      {mediaError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 text-center px-6">
          <p className="text-sm text-zinc-200">
            This video could not be played. It may still be processing or the
            file is unavailable.
          </p>
          <button
            type="button"
            onClick={() => {
              setMediaError(false);
              videoRef.current?.load();
            }}
            className="px-4 py-2 rounded-full bg-red-600 text-white text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      )}

      {/* Center Big Play Button when paused */}
      {!isPlaying && !mediaError && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play video"
          className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-red-600/95 hover:bg-red-500 text-white flex items-center justify-center shadow-2xl transition-transform hover:scale-105 cursor-pointer"
        >
          <Play className="w-7 h-7 fill-white ml-0.5" />
        </button>
      )}

      {/* Bottom Controls Bar */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-8 pb-3 px-4 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
        {/* Scrubbable Progress Bar */}
        <div className="relative flex items-center w-full mb-2.5">
          <div className="w-full h-1.5 bg-zinc-600/80 rounded-full overflow-hidden">
            <div
              className="h-full bg-red-600"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={effectiveDuration}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="absolute -inset-y-2 inset-x-0 w-full h-[calc(100%+1rem)] opacity-0 cursor-pointer"
            aria-label="Seek video progress"
          />
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between gap-2 text-white">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              className="p-1.5 rounded-lg hover:bg-white/15 transition-colors cursor-pointer"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-white" />
              ) : (
                <Play className="w-5 h-5 fill-white" />
              )}
            </button>

            {/* Volume */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleMute}
                className="p-1.5 rounded-lg hover:bg-white/15 transition-colors cursor-pointer"
                aria-label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="hidden sm:block w-20 accent-red-600 cursor-pointer"
                aria-label="Volume"
              />
            </div>

            {/* Timecode */}
            <div className="text-xs font-medium tabular-nums text-zinc-200 ml-1">
              <span>{formatDuration(currentTime)}</span>
              <span className="mx-1 text-zinc-400">/</span>
              <span>{formatDuration(effectiveDuration)}</span>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-1.5 relative">
            {/* Captions Toggle */}
            <button
              type="button"
              onClick={() => setCaptionsEnabled((c) => !c)}
              title="Subtitles / Closed Captions"
              className={`p-1.5 rounded-lg hover:bg-white/15 transition-colors cursor-pointer ${
                captionsEnabled ? "text-red-500 bg-white/10" : "text-white"
              }`}
            >
              <Subtitles className="w-5 h-5" />
            </button>

            {/* Speed & Quality Settings */}
            <button
              type="button"
              onClick={() => setSettingsOpen((o) => !o)}
              title="Playback Settings"
              className="p-1.5 rounded-lg hover:bg-white/15 transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold"
            >
              <Settings className="w-4 h-4" />
              <span>{playbackRate}x</span>
            </button>

            {settingsOpen && (
              <div className="absolute bottom-11 right-0 w-56 rounded-xl bg-zinc-900/95 border border-zinc-700 p-3 shadow-2xl z-50 text-xs space-y-3 backdrop-blur-md">
                <div>
                  <div className="text-zinc-400 font-semibold mb-1.5">
                    Playback Speed
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => changeSpeed(rate)}
                        className={`py-1 rounded font-medium cursor-pointer ${
                          playbackRate === rate
                            ? "bg-red-600 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-zinc-400 font-semibold mb-1.5">
                    Stream Quality
                  </div>
                  <div className="flex flex-col gap-1">
                    {["Auto (Source)", "1080p HD", "720p"].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => {
                          setQuality(q);
                          setSettingsOpen(false);
                        }}
                        className={`px-2.5 py-1 rounded text-left cursor-pointer ${
                          quality === q
                            ? "bg-red-600/20 text-red-400 font-semibold"
                            : "hover:bg-zinc-800 text-zinc-300"
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Theater Mode */}
            <button
              type="button"
              onClick={onToggleTheater}
              title="Theater Mode"
              className="hidden md:inline-flex p-1.5 rounded-lg hover:bg-white/15 transition-colors cursor-pointer"
            >
              <RectangleHorizontal className="w-5 h-5" />
            </button>

            {/* Fullscreen */}
            <button
              type="button"
              onClick={toggleFullscreen}
              title="Fullscreen"
              className="p-1.5 rounded-lg hover:bg-white/15 transition-colors cursor-pointer"
            >
              {isFullscreen ? (
                <Minimize className="w-5 h-5" />
              ) : (
                <Maximize className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
