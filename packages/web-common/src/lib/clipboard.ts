/**
 * Copies text to the clipboard.
 * Calls navigator.clipboard.writeText synchronously inside the gesture turn before any await,
 * falling back to an off-screen textarea with document.execCommand('copy') if the Clipboard
 * API is unavailable or rejects. Never rejects.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      const writePromise = navigator.clipboard.writeText(text);
      await writePromise;
      return true;
    } catch {
      // Clipboard API threw or rejected; proceed to execCommand fallback
    }
  }

  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';

  try {
    document.body.appendChild(textarea);
    textarea.select();
    return Boolean(document.execCommand('copy'));
  } catch {
    return false;
  } finally {
    if (textarea.parentNode) {
      textarea.parentNode.removeChild(textarea);
    }
  }
}
