import packageJson from '../../package.json';

export function getDeploymentInfo() {
  return {
    service: 'TaxBot API',
    version: packageJson.version,
    environment: process.env.NODE_ENV || 'development',
    commit: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || process.env.GIT_COMMIT || 'unknown',
    buildTime: process.env.BUILD_TIME || 'unknown',
  };
}
