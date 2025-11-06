export function formatFileSize(sizeBytes: number) {
  if (Number.isNaN(sizeBytes) || sizeBytes <= 0) {
    return "0 KB";
  }

  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
}
