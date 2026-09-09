import { useState, useCallback } from "react";
/**
 * React hook for handling file uploads with presigned URLs.
 *
 * This hook implements the two-step presigned URL upload flow:
 * 1. Request a presigned URL from your backend (sends JSON metadata, NOT the file)
 * 2. Upload the file directly to the presigned URL
 *
 * @example
 * ```tsx
 * function FileUploader() {
 *   const { uploadFile, isUploading, error } = useUpload({
 *     onSuccess: (response) => {
 *       console.log("Uploaded to:", response.objectPath);
 *     },
 *   });
 *
 *   const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
 *     const file = e.target.files?.[0];
 *     if (file) {
 *       await uploadFile(file);
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       <input type="file" onChange={handleFileChange} disabled={isUploading} />
 *       {isUploading && <p>Uploading...</p>}
 *       {error && <p>Error: {error.message}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useUpload(options = {}) {
    const basePath = options.basePath ?? "/api/storage";
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState(null);
    const [progress, setProgress] = useState(0);
    const requestUploadUrl = useCallback(async (file) => {
        const token = options.getAuthToken?.();
        const response = await fetch(`${basePath}/uploads/request-url`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
                name: file.name,
                size: file.size,
                contentType: file.type || "application/octet-stream",
            }),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || "Failed to get upload URL");
        }
        return response.json();
    }, [basePath, options]);
    const uploadToPresignedUrl = useCallback(async (file, uploadURL) => {
        const response = await fetch(uploadURL, {
            method: "PUT",
            body: file,
            headers: {
                "Content-Type": file.type || "application/octet-stream",
            },
        });
        if (!response.ok) {
            throw new Error("Failed to upload file to storage");
        }
    }, []);
    const uploadFile = useCallback(async (file) => {
        setIsUploading(true);
        setError(null);
        setProgress(0);
        try {
            setProgress(10);
            const uploadResponse = await requestUploadUrl(file);
            setProgress(30);
            await uploadToPresignedUrl(file, uploadResponse.uploadURL);
            setProgress(100);
            options.onSuccess?.(uploadResponse);
            return uploadResponse;
        }
        catch (err) {
            const error = err instanceof Error ? err : new Error("Upload failed");
            setError(error);
            options.onError?.(error);
            return null;
        }
        finally {
            setIsUploading(false);
        }
    }, [requestUploadUrl, uploadToPresignedUrl, options]);
    const getUploadParameters = useCallback(async (file) => {
        const token = options.getAuthToken?.();
        const response = await fetch(`${basePath}/uploads/request-url`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
                name: file.name,
                size: file.size,
                contentType: file.type || "application/octet-stream",
            }),
        });
        if (!response.ok) {
            throw new Error("Failed to get upload URL");
        }
        const data = await response.json();
        return {
            method: "PUT",
            url: data.uploadURL,
            headers: { "Content-Type": file.type || "application/octet-stream" },
        };
    }, [basePath, options]);
    return {
        uploadFile,
        getUploadParameters,
        isUploading,
        error,
        progress,
    };
}
