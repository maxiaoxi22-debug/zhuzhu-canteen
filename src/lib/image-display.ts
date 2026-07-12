export function shouldBypassImageOptimization(environment: string | undefined) {
  return environment === "development";
}

export function getDisplayImageSrc(source: string, environment: string | undefined) {
  return environment === "development" ? `/api/image?url=${encodeURIComponent(source)}` : source;
}

export const BYPASS_IMAGE_OPTIMIZATION = shouldBypassImageOptimization(process.env.NODE_ENV);
