"use client";

import { CHUNK_SIZE, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "./upload-config";
import { getSessionToken, installAuthFetchInterceptor } from "./client";
import { apiUrl } from "@/lib/api-config";
import {
  USE_EXTERNAL_BACKEND,
  videoUploadCandidates,
  authEndpoints,
} from "./api-config";

export interface UploadProgress {
  /** 0–100, derived from bytes the SERVER has acknowledged. Never faked. */
  percent: number;
  uploadedBytes: number;
  totalBytes: number;
  /** Bytes/sec over a moving window, or null until measurable. */
  bytesPerSecond: number | null;
  /** Seconds remaining, or null when not yet measurable. */
  etaSeconds: number | null;
}

export interface UploadedAsset {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export class UploadCancelledError extends Error {
  constructor() {
    super("Upload cancelled");
    this.name = "UploadCancelledError";
  }
}

export interface UploadHandle {
  promise: Promise<UploadedAsset>;
  cancel: () => void;
}

/**
 * Always resolve the freshest session token before an upload request.
 * Re-seeds the interceptor first so a token written to storage after a soft
 * navigation is picked up (prevents the "session expired" 401 during upload).
 */
function authHeaders(): Record<string, string> {
  try {
    installAuthFetchInterceptor();
  } catch {
    /* ignore */
  }
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data?.error || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Chunked, resumable upload.
 *
 * Progress is reported from the server's acknowledged byte count after each
 * chunk, so the percentage always reflects bytes that genuinely landed on the
 * server — it is never animated or estimated.
 *
 * On a network error the same `uploadId` is reused: the client asks the server
 * how many bytes it already holds and continues from there, so a dropped
 * connection does not restart the upload or create a duplicate asset.
 */
/**
 * External-backend upload: a single multipart/form-data POST to the real
 * video endpoint (auto-detected from candidates). Uses XHR so we get REAL
 * upload progress. Content-Type is left to the browser (never set manually),
 * credentials are included, and the bearer token is attached as a fallback.
 * Returns extra publish fields (title/description/etc.) so the backend can
 * create the video in ONE request when it expects that.
 */
function uploadFileExternal(
  file: File,
  opts: {
    onProgress?: (p: UploadProgress) => void;
    extraFields?: Record<string, string>;
  }
): UploadHandle {
  let xhr: XMLHttpRequest | null = null;
  let cancelled = false;

  const cancel = () => {
    cancelled = true;
    xhr?.abort();
  };

  const promise = (async (): Promise<UploadedAsset> => {
    const isImage = file.type.startsWith("image/");
    const cap = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (file.size > cap) {
      throw new Error(
        `This file is too large. Maximum size is ${Math.round(cap / (1024 * 1024))} MB.`
      );
    }
    if (file.size === 0) {
      throw new Error("That file appears to be empty. Please choose another file.");
    }

    installAuthFetchInterceptor();
    const token = getSessionToken();

    // Detect which upload route AND which multipart field name the backend
    // exposes. Sending several file fields at once breaks backends that use a
    // strict multer `.single("video")` parser ("Unexpected field" → 400), so we
    // send exactly ONE file field and fall through candidates on failure:
    //   404 -> next endpoint, 400/422 -> next field name, 401/403 -> auth error.
    const FIELD_NAMES = ["video", "file", "videoFile"];
    let fieldError = "";

    let lastError = "Upload failed. Please try again.";
    outer: for (const endpoint of videoUploadCandidates) {
      for (const fieldName of FIELD_NAMES) {
        if (cancelled) throw new UploadCancelledError();

        const form = new FormData();
        form.append(fieldName, file);
        for (const [k, v] of Object.entries(opts.extraFields || {})) {
          if (v !== undefined && v !== null) form.append(k, String(v));
        }

      const result = await new Promise<
        { ok: true; data: UploadedAsset } | { ok: false; status: number; message: string }
      >((resolve) => {
        xhr = new XMLHttpRequest();
        xhr.open("POST", endpoint, true);
        xhr.withCredentials = true; // send existing session cookie
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        // NOTE: never set Content-Type — the browser adds the multipart boundary.

        if (opts.onProgress) {
          xhr.upload.onprogress = (e) => {
            if (!e.lengthComputable) return;
            opts.onProgress?.({
              percent: Math.min(100, Math.round((e.loaded / e.total) * 100)),
              uploadedBytes: e.loaded,
              totalBytes: e.total,
              bytesPerSecond: null,
              etaSeconds: null,
            });
          };
        }

        xhr.onload = () => {
          const status = xhr!.status;
          let body: unknown = null;
          try {
            body = JSON.parse(xhr!.responseText);
          } catch {
            body = null;
          }
          if (status >= 200 && status < 300) {
            const b = (body || {}) as Record<string, any>;
            const node = b.data || b.video || b;
            const url =
              node.url || node.videoUrl || node.secure_url || node.location || "";
            resolve({
              ok: true,
              data: {
                id: String(node.id || node._id || node.publicId || url),
                url,
                filename: file.name,
                mimeType: file.type || "application/octet-stream",
                sizeBytes: file.size,
              },
            });
          } else {
            const b = (body || {}) as Record<string, any>;
            resolve({
              ok: false,
              status,
              message: b.message || b.error || "Upload failed.",
            });
          }
        };
        xhr.onerror = () =>
          resolve({ ok: false, status: 0, message: "network" });
        xhr.onabort = () =>
          resolve({ ok: false, status: -1, message: "aborted" });

        xhr.send(form);
      });

      if (result.ok) return result.data;
      if (result.message === "aborted") throw new UploadCancelledError();
      if (result.status === 0) {
        throw new Error(
          "We couldn't reach the server. Please check your connection and try again."
        );
      }
      if (result.status === 404) {
        lastError = "Upload service was not found on the server.";
        continue outer; // this endpoint does not exist
      }
      if (result.status === 401 || result.status === 403) {
        throw new Error(
          "Your session has expired. Please sign in again, then retry the upload."
        );
      }
      if (result.status === 413) {
        throw new Error("This file is too large for the server.");
      }
      if (result.status === 400 || result.status === 422) {
        // Endpoint exists but rejected this multipart field name (strict
        // multer-style parsers). Try the next field name for this endpoint.
        fieldError = result.message || lastError;
        continue;
      }
      // Endpoint exists but the request is otherwise invalid — no retry helps.
      throw new Error(result.message || lastError);
      }
    }
    // Prefer the field-specific rejection if an endpoint rejected the field.
    throw new Error(fieldError || lastError);
  })();

  return { promise, cancel } as UploadHandle;
}

export function uploadFile(
  file: File,
  opts: {
    onProgress?: (p: UploadProgress) => void;
    /** Reuse to resume a previous attempt for the same file. */
    uploadId?: string;
    maxRetriesPerChunk?: number;
    /** Publish metadata for one-shot external-backend uploads. */
    extraFields?: Record<string, string>;
  } = {}
): UploadHandle {
  // External backend: single multipart POST to the real video endpoint.
  if (USE_EXTERNAL_BACKEND) {
    return uploadFileExternal(file, {
      onProgress: opts.onProgress,
      extraFields: opts.extraFields,
    });
  }

  const uploadId =
    opts.uploadId ||
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const maxRetries = opts.maxRetriesPerChunk ?? 4;

  let cancelled = false;
  let activeController: AbortController | null = null;

  const cancel = () => {
    cancelled = true;
    activeController?.abort();
    // Best-effort server-side cleanup of the partial file.
    fetch(apiUrl(`/upload?uploadId=${encodeURIComponent(uploadId)}`), {
      method: "DELETE",
      headers: authHeaders(),
      credentials: "include",
      keepalive: true,
    }).catch(() => {});
  };

  const promise = (async (): Promise<UploadedAsset> => {
    const isImage = file.type.startsWith("image/");
    const cap = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (file.size > cap) {
      throw new Error(
        `This file is too large. Maximum size is ${Math.round(cap / (1024 * 1024))} MB.`
      );
    }
    if (file.size === 0) {
      throw new Error("That file appears to be empty. Please choose another file.");
    }

    // Verify the session is actually reachable BEFORE streaming the file, and
    // give the token infra a moment to rehydrate if this runs right after a
    // soft navigation. Prevents a wasted upload that dies on a mid-stream 401.
    installAuthFetchInterceptor();
    let token = getSessionToken();
    if (!token) {
      // brief retry — storage/cookie may become readable a tick later
      await new Promise((r) => setTimeout(r, 250));
      installAuthFetchInterceptor();
      token = getSessionToken();
    }
    // Confirm the server accepts our credentials right now.
    try {
      const meRes = await fetch(authEndpoints.me, {
        credentials: "include",
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (meRes.status === 401 || meRes.status === 403) {
        throw new Error(
          "Your session has expired. Please sign in again, then retry the upload."
        );
      }
      if (meRes.ok) {
        const me = await meRes.json().catch(() => null);
        // Built-in backend reports { authenticated }. External /auth/me returns
        // the user object directly, so treat a 2xx as a valid session.
        if (me && me.authenticated === false) {
          throw new Error(
            "Your session has expired. Please sign in again, then retry the upload."
          );
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("expired")) throw e;
      // network hiccup on the check — continue; chunk requests handle 401 below
    }

    // Resume: ask the server what it already has for this uploadId.
    let offset = 0;
    if (opts.uploadId) {
      try {
        const res = await fetch(apiUrl(`/upload?uploadId=${encodeURIComponent(uploadId)}`),
          { headers: authHeaders(), credentials: "include", cache: "no-store" }
        );
        if (res.ok) {
          const data = await res.json();
          if (typeof data.received === "number" && data.received <= file.size) {
            offset = data.received;
          }
        }
      } catch {
        offset = 0;
      }
    }

    const started = Date.now();
    let lastTick = started;
    let lastBytes = offset;
    let speed: number | null = null;

    const report = (uploaded: number) => {
      const now = Date.now();
      const dt = (now - lastTick) / 1000;
      if (dt >= 0.4) {
        const instant = (uploaded - lastBytes) / dt;
        // Exponential smoothing keeps the readout stable on mobile networks.
        speed = speed === null ? instant : speed * 0.6 + instant * 0.4;
        lastTick = now;
        lastBytes = uploaded;
      }
      const remaining = file.size - uploaded;
      opts.onProgress?.({
        percent: Math.min(100, Math.round((uploaded / file.size) * 100)),
        uploadedBytes: uploaded,
        totalBytes: file.size,
        bytesPerSecond: speed && speed > 0 ? speed : null,
        etaSeconds: speed && speed > 0 ? Math.max(0, remaining / speed) : null,
      });
    };

    report(offset);

    while (offset < file.size) {
      if (cancelled) throw new UploadCancelledError();

      const end = Math.min(offset + CHUNK_SIZE, file.size);
      // `slice` is a view — the whole file is never held in memory.
      const chunk = file.slice(offset, end);
      const isFinal = end >= file.size;

      let attempt = 0;
      let done = false;

      while (!done) {
        if (cancelled) throw new UploadCancelledError();
        activeController = new AbortController();
        try {
          const res = await fetch(apiUrl(`/upload?uploadId=${encodeURIComponent(uploadId)}&offset=${offset}${
              isFinal ? "&final=1" : ""
            }`),
            {
              method: "POST",
              headers: {
                ...authHeaders(),
                "Content-Type": "application/octet-stream",
                "x-file-name": encodeURIComponent(file.name),
                "x-file-type": file.type || "application/octet-stream",
              },
              body: chunk,
              credentials: "include",
              signal: activeController.signal,
            }
          );

          if (res.status === 409) {
            // Server is at a different offset — realign and continue.
            const data = await res.json().catch(() => ({}));
            if (typeof data.expectedOffset === "number") {
              offset = data.expectedOffset;
              done = true;
              break;
            }
            throw new Error("Upload got out of sync. Please retry.");
          }

          // A 401 mid-upload usually means the in-memory token wasn't seeded
          // (soft navigation / iframe storage). Re-seed and retry ONCE per
          // chunk before giving up, instead of failing the whole upload.
          if (res.status === 401 && attempt < 1) {
            installAuthFetchInterceptor();
            getSessionToken();
            attempt += 1;
            continue;
          }

          if (!res.ok) {
            const message = await readError(
              res,
              res.status === 401
                ? "Your session has expired. Please sign in again, then retry the upload."
                : res.status === 413
                ? "This file is too large for the server."
                : "Upload failed. Please check your internet connection and try again."
            );
            // Size/format problems will not succeed on retry.
            if (res.status === 413 || res.status === 400) {
              throw new Error(message);
            }
            if (res.status === 401) {
              throw new Error(message);
            }
            throw Object.assign(new Error(message), { retryable: true });
          }

          const data = await res.json();

          if (isFinal && data?.url) {
            report(file.size);
            return data as UploadedAsset;
          }

          const received =
            typeof data.received === "number" ? data.received : end;
          offset = received;
          report(offset);
          done = true;
        } catch (err) {
          if (cancelled) throw new UploadCancelledError();
          const e = err as Error & { retryable?: boolean; name?: string };
          const networkish =
            e.name === "TypeError" || e.name === "AbortError" || e.retryable;

          if (!networkish || attempt >= maxRetries) {
            throw new Error(
              e.message ||
                "Upload failed. Please check your internet connection and try again."
            );
          }
          attempt += 1;
          // Backoff, then resync with the server before resending.
          await new Promise((r) => setTimeout(r, Math.min(8000, 600 * 2 ** attempt)));
          try {
            const statusRes = await fetch(apiUrl(`/upload?uploadId=${encodeURIComponent(uploadId)}`),
              { headers: authHeaders(), credentials: "include", cache: "no-store" }
            );
            if (statusRes.ok) {
              const s = await statusRes.json();
              if (typeof s.received === "number") {
                offset = s.received;
                report(offset);
              }
            }
          } catch {
            /* keep current offset and retry */
          }
        } finally {
          activeController = null;
        }
      }
    }

    throw new Error("Upload did not complete. Please try again.");
  })();

  return { promise, cancel, ...{ uploadId } } as UploadHandle & { uploadId: string };
}

/** Small single-shot upload (thumbnails / images). */
export async function uploadSmallFile(file: File): Promise<UploadedAsset> {
  // External backend: multipart FormData to the real upload route (browser
  // sets Content-Type; credentials + bearer sent).
  if (USE_EXTERNAL_BACKEND) {
    const handle = uploadFileExternal(file, {});
    return handle.promise;
  }

  const res = await fetch(apiUrl("/upload"), {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": file.type || "application/octet-stream",
      "x-file-name": encodeURIComponent(file.name),
      "x-file-type": file.type || "application/octet-stream",
    },
    body: file,
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await readError(res, "Could not upload that image."));
  }
  return (await res.json()) as UploadedAsset;
}
