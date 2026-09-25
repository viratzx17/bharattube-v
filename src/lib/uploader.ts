"use client";

import { MAX_VIDEO_BYTES } from "./upload-config";
import { getSessionToken, installAuthFetchInterceptor } from "./client";
import { videoUploadCandidates } from "./api-config";

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
 * Upload and create a video through the existing Express API in one
 * multipart request. The backend owns Cloudinary upload + MongoDB creation,
 * so the browser never invents an intermediate media API.
 */
export function uploadVideoMultipart(
  videoFile: File,
  thumbnailFile: File | null,
  captionsFile: File | null,
  musicFile: File | null,
  fields: Record<string, string>,
  onProgress?: (progress: UploadProgress) => void
): UploadHandle & { uploadId?: string } {
  let xhr: XMLHttpRequest | null = null;
  let cancelled = false;

  const cancel = () => {
    cancelled = true;
    xhr?.abort();
  };

  const promise = new Promise<UploadedAsset>(async (resolve, reject) => {
    if (!videoFile || videoFile.size <= 0) {
      reject(new Error("Please choose a valid video file."));
      return;
    }
    if (videoFile.size > MAX_VIDEO_BYTES) {
      reject(new Error(`This video is too large. Maximum size is ${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))} MB.`));
      return;
    }

    const form = new FormData();
    form.append("video", videoFile);
    if (thumbnailFile) form.append("thumbnail", thumbnailFile);
    if (captionsFile) form.append("captions", captionsFile);
    if (musicFile) form.append("music", musicFile);
    Object.entries(fields).forEach(([key, value]) => form.append(key, value));

    xhr = new XMLHttpRequest();
    xhr.open("POST", videoUploadCandidates[0], true);
    xhr.withCredentials = true;

    const token = getSessionToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
      onProgress?.({
        percent,
        uploadedBytes: Math.round(videoFile.size * (percent / 100)),
        totalBytes: videoFile.size,
        bytesPerSecond: null,
        etaSeconds: null,
      });
    };

    xhr.onload = () => {
      if (cancelled) return;
      let payload: any = null;
      try {
        payload = JSON.parse(xhr!.responseText);
      } catch {
        payload = null;
      }

      if (xhr!.status >= 200 && xhr!.status < 300) {
        const created = payload?.data ?? payload?.video ?? payload;
        const id = created?._id ?? created?.id;
        const url = created?.videoUrl ?? created?.url ?? "";
        if (!id) {
          reject(new Error("The server accepted the upload but did not return the created video."));
          return;
        }
        onProgress?.({
          percent: 100,
          uploadedBytes: videoFile.size,
          totalBytes: videoFile.size,
          bytesPerSecond: null,
          etaSeconds: 0,
        });
        resolve({
          id: String(id),
          url: String(url),
          filename: videoFile.name,
          mimeType: videoFile.type || "application/octet-stream",
          sizeBytes: videoFile.size,
        });
        return;
      }

      if (xhr!.status === 401 || xhr!.status === 403) {
        reject(new Error("Your session has expired. Please sign in again, then retry the upload."));
        return;
      }

      if (xhr!.status === 413) {
        reject(new Error("This video is too large for the server."));
        return;
      }

      reject(new Error(payload?.message || payload?.error || "Video upload failed."));
    };

    xhr.onerror = () => reject(new Error("We couldn't reach the upload server. Please check your connection and try again."));
    xhr.ontimeout = () => reject(new Error("The upload timed out. Please try again."));
    xhr.onabort = () => reject(new UploadCancelledError());

    try {
      xhr.send(form);
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Unable to start upload."));
    }
  });

  return { promise, cancel } as UploadHandle & { uploadId?: string };
}
