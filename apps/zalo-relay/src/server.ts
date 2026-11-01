import { serve } from '@hono/node-server';
import { createApp } from './app.js';

let app: ReturnType<typeof createApp>;
try {
  app = createApp({ secret: process.env.ZALO_RELAY_SECRET ?? '', log: (line) => console.log(line) });
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

serve({ fetch: app.fetch, port: 8080 }, (info) => {
  console.log(`zalo-relay listening on ${info.port} (rev ${process.env.RELAY_REVISION ?? 'dev'})`);
});
