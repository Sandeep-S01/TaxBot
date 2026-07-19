export function getPublicAppOrigin(): string {
  if (process.env.APP_ORIGIN) {
    return process.env.APP_ORIGIN.replace(/\/$/, '');
  }
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
  }
  return `http://localhost:${process.env.PORT || 3000}`;
}
