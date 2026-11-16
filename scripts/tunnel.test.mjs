import test from 'node:test';
import assert from 'node:assert/strict';
import { NGROK_ORIGIN, readTunnelOrigin, tunnelCommand } from './tunnel.mjs';

test('readTunnelOrigin finds the value, strips quotes and trailing slashes', () => {
  assert.equal(readTunnelOrigin('TUNNEL_ORIGIN=https://dev.example.me'), 'https://dev.example.me');
  assert.equal(readTunnelOrigin('# note\nTUNNEL_ORIGIN = "https://dev.example.me/"\n'), 'https://dev.example.me');
  assert.equal(readTunnelOrigin('OTHER=x'), null);
  assert.equal(readTunnelOrigin(''), null);
});

test('dsm command exposes wrangler on the LAN with the DSM origin and starts no ngrok', () => {
  const cmd = tunnelCommand('dsm', 'https://dev.example.me');
  assert.match(cmd, /--ip 0\.0\.0\.0 --var APP_ORIGIN:https:\/\/dev\.example\.me/);
  assert.doesNotMatch(cmd, /ngrok/);
});

test('ngrok command keeps the fixed ngrok domain', () => {
  const cmd = tunnelCommand('ngrok');
  assert.ok(cmd.includes(`APP_ORIGIN:${NGROK_ORIGIN}`));
  assert.ok(cmd.includes(`ngrok http 8787 --url ${NGROK_ORIGIN}`));
});
