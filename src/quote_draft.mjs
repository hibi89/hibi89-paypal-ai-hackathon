// Intentionally NOT artificial intelligence. Safe, deterministic offline placeholder.
// Replace with a genuinely validated free model provider once private access is available.
export function createOfflineMockDraftProvider() {
  return async function suggestDraft({ scope, currency }) {
    if (currency !== 'USD' || typeof scope !== 'string' ||
        scope.length < 8 || scope.length > 500)
      throw new TypeError('INVALID_MOCK_SCOPE');
    // Fixed demo-only labor tiers, not an actual market value estimate.
    const words = scope.trim().split(/\s+/u).length;
    const tier = Math.min(10, Math.max(1, Math.ceil(words / 8)));
    return {
      source: 'OFFLINE_MOCK',
      suggestedMinor: Math.min(1000000, 3000 + tier * 2500),
      notice: 'A deterministic price placeholder, not AI-generated advice',
    };
  };
}
