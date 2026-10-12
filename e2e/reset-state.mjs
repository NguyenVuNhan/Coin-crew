// Wipes the local D1 state used by the end-to-end run so every run starts empty.
import { rmSync } from 'node:fs';

rmSync(new URL('../apps/api/.wrangler/e2e', import.meta.url), { recursive: true, force: true });
