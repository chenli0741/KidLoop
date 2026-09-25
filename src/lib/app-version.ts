import "server-only";

/** Identifies the deployment serving the current request. */
export function getAppVersion() {
  return (
    process.env.VERCEL_DEPLOYMENT_ID ??
    process.env.VERCEL_URL ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    "local-development"
  );
}
