export const linkTokens = {
  set(tripId: string, token: string): void {
    try {
      localStorage.setItem(`lt:${tripId}`, token);
    } catch {
      // storage access may fail in private mode or quota exceeded
    }
  },

  get(tripId: string): string | null {
    try {
      return localStorage.getItem(`lt:${tripId}`);
    } catch {
      return null;
    }
  },
};
