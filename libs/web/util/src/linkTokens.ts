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

  /** Forget every saved group link (signing out). */
  clearAll(): void {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('lt:')) keys.push(key);
      }
      keys.forEach((key) => localStorage.removeItem(key));
    } catch {
      // storage access may fail in private mode
    }
  },
};
