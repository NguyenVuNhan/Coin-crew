import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useT } from '../i18n';
import { Snackbar } from './Snackbar';

const LABELS: Record<string, string> = { google: 'Google', zalo: 'Zalo' };
const KEYS = ['auth', 'linked', 'merge', 'provider'];

/** Shows one message for the sign-in redirect flags in the URL, then clears them. */
export function AuthNotice() {
  const t = useT();
  const { search } = useLocation();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (!KEYS.some((k) => params.has(k))) return;
    const label = (v: string | null) => (v && LABELS[v]) || '';
    let next: string | null = null;
    if (params.get('auth') === 'failed') next = t('auth.failed');
    else if (params.get('linked')) next = t('auth.linked', { provider: label(params.get('linked')) });
    else if (params.get('merge') === 'requested') next = t('auth.mergeRequested', { provider: label(params.get('provider')) });
    for (const k of KEYS) params.delete(k);
    const rest = params.toString();
    navigate({ search: rest ? `?${rest}` : '' }, { replace: true });
    if (next) setMessage(next);
  }, [search, navigate, t]);

  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(id);
  }, [message]);

  return message ? <Snackbar message={message} /> : null;
}
