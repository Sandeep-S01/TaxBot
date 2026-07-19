export function isUsableAnthropicKey(apiKey: string | undefined): boolean {
  return Boolean(
    apiKey &&
      !apiKey.includes('placeholder') &&
      !apiKey.includes('your_') &&
      apiKey.length >= 20
  );
}

export function shouldUseSimulatedAuditResponse(apiKey: string | undefined, nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv !== 'production' && !isUsableAnthropicKey(apiKey);
}
