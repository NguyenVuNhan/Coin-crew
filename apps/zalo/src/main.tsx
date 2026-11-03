import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as sdk from 'zmp-sdk';
import '@fontsource/be-vietnam-pro/vietnamese-400.css';
import '@fontsource/be-vietnam-pro/latin-400.css';
import '@fontsource/be-vietnam-pro/vietnamese-500.css';
import '@fontsource/be-vietnam-pro/latin-500.css';
import '@fontsource/be-vietnam-pro/vietnamese-600.css';
import '@fontsource/be-vietnam-pro/latin-600.css';
import '@fontsource/be-vietnam-pro/vietnamese-700.css';
import '@fontsource/be-vietnam-pro/latin-700.css';
import '@cc/web-ui/styles.css';
import { AppRoot, bootApp } from '@cc/web-screens';
import { createZaloPlatform, zmpBasename, type ZmpSdk } from './platform/zaloMiniApp';

const apiOrigin = import.meta.env.VITE_API_ORIGIN as string;
const platform = createZaloPlatform(sdk as unknown as ZmpSdk, apiOrigin);

// We draw our own header; Zalo keeps only its "··· | ×" capsule, so the header leaves room for it.
void sdk.configAppView({ actionBar: { hide: true }, statusBarType: 'transparent', headerTextColor: 'black' }).catch(() => {});
const root = document.documentElement;
root.style.setProperty('--zmp-safe-top', 'var(--zaui-safe-area-inset-top, env(safe-area-inset-top, 0px))');
root.style.setProperty('--zmp-capsule-width', '88px');

void bootApp(platform).then(() => {
  // Zalo's runtime mounts the app into #app; a local `vite dev` uses index.html's #root.
  const el = document.getElementById('app') ?? document.getElementById('root');
  if (el) {
    createRoot(el).render(
      <StrictMode>
        <AppRoot platform={platform} basename={zmpBasename(window.location.pathname)} />
      </StrictMode>,
    );
  }
});
