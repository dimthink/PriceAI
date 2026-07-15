"use client";

import { useCallback, useRef, useState } from "react";

export type UploadedFeedbackEvidence = {
  url: string;
  name: string;
  mimeType: string;
  size: number;
};

export type FailedFeedbackEvidenceUpload = {
  id: string;
  file: File;
  message: string;
};

export function useFeedbackEvidenceUpload(input: {
  canUpload: boolean;
  maxImages: number;
  onAuthRequired: () => void;
  onError: (message: string) => void;
}) {
  const { canUpload, maxImages, onAuthRequired, onError } = input;
  const [uploaded, setUploaded] = useState<UploadedFeedbackEvidence[]>([]);
  const [failed, setFailed] = useState<FailedFeedbackEvidenceUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const draftIdRef = useRef("");

  const uploadFiles = useCallback(async (files: File[]) => {
    if (!canUpload) {
      onAuthRequired();
      return;
    }
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (!images.length) return;

    const availableSlots = maxImages - uploaded.length - failed.length;
    if (availableSlots <= 0) {
      onError(`最多上传 ${maxImages} 张图片证据。`);
      return;
    }

    setUploading(true);
    const candidates = images.slice(0, availableSlots).map((file) => ({
      id: crypto.randomUUID(),
      file,
    }));

    for (const candidate of candidates) {
      try {
        const evidence = await uploadOne(candidate.file, getOrCreateDraftId(draftIdRef));
        setUploaded((current) => [...current, evidence].slice(0, maxImages));
      } catch (error) {
        const message = error instanceof Error ? error.message : "图片上传失败。";
        if (/登录/.test(message)) onAuthRequired();
        setFailed((current) => [...current, { ...candidate, message }]);
      }
    }

    if (images.length > availableSlots) {
      onError(`最多上传 ${maxImages} 张图片，超出的图片没有上传。`);
    }
    setUploading(false);
  }, [canUpload, failed.length, maxImages, onAuthRequired, onError, uploaded.length]);

  const retryFailed = useCallback(async (id: string) => {
    const target = failed.find((item) => item.id === id);
    if (!target) return;
    if (!canUpload) {
      onAuthRequired();
      return;
    }

    setUploading(true);
    try {
      const evidence = await uploadOne(target.file, getOrCreateDraftId(draftIdRef));
      setUploaded((current) => [...current, evidence].slice(0, maxImages));
      setFailed((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "图片上传失败。";
      if (/登录/.test(message)) onAuthRequired();
      setFailed((current) => current.map((item) => item.id === id ? { ...item, message } : item));
      onError(message);
    } finally {
      setUploading(false);
    }
  }, [canUpload, failed, maxImages, onAuthRequired, onError]);

  const removeUploaded = useCallback(async (reference: string) => {
    const target = uploaded.find((item) => item.url === reference);
    if (!target) return;
    setUploaded((current) => current.filter((item) => item.url !== reference));
    try {
      const response = await fetch("/api/feedback/evidence", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(payload.message || "图片证据删除失败。");
    } catch (error) {
      setUploaded((current) => current.some((item) => item.url === reference) ? current : [...current, target]);
      onError(error instanceof Error ? error.message : "图片证据删除失败。");
    }
  }, [onError, uploaded]);

  const removeFailed = useCallback((id: string) => {
    setFailed((current) => current.filter((item) => item.id !== id));
  }, []);

  const clear = useCallback(() => {
    setUploaded([]);
    setFailed([]);
    draftIdRef.current = "";
  }, []);

  return {
    uploaded,
    failed,
    uploading,
    uploadFiles,
    retryFailed,
    removeUploaded,
    removeFailed,
    clear,
  };
}

async function uploadOne(file: File, draftId: string): Promise<UploadedFeedbackEvidence> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("website", "");
  formData.append("draftId", draftId);
  const response = await fetch("/api/feedback/evidence", { method: "POST", body: formData });
  const payload = await response.json().catch(() => ({ ok: false, message: response.statusText }));
  if (!response.ok || !payload.ok) throw new Error(payload.message || "图片上传失败。");
  return {
    url: String(payload.evidence.url),
    name: String(payload.evidence.name || file.name || "图片证据"),
    mimeType: String(payload.evidence.mimeType || file.type),
    size: Number(payload.evidence.size || file.size),
  };
}

function getOrCreateDraftId(reference: { current: string }): string {
  if (!reference.current) reference.current = crypto.randomUUID();
  return reference.current;
}
