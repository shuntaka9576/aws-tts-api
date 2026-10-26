import { once } from 'node:events';
import { expect, it } from 'vitest';
import { createHandler } from '../src/tts.js';
import { createLocalServer } from '../src/local-server.js';

it('serves binary audio over HTTP, rejects missing keys and validates text', async () => {
  const fixture = Buffer.from([0xff, 0xfb, 0x00, 0x01]);
  const server = createLocalServer(
    createHandler(async () => fixture),
    'test-key'
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No address');
    const url = `http://127.0.0.1:${address.port}/tts`;
    expect((await fetch(url, { method: 'POST' })).status).toBe(403);
    const headers = {
      'x-api-key': 'test-key',
      'Content-Type': 'application/json',
    };
    expect(
      (await fetch(url, { method: 'POST', headers, body: '{}' })).status
    ).toBe(400);
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: 'こんにちは' }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/mpeg');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(fixture);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
