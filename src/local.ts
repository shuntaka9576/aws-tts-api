import { createLocalServer } from './local-server.js';
import { handler } from './tts.js';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? '3000');
const apiKey =
  process.env.TTS_API_KEY ?? (host === '127.0.0.1' ? 'local-dev-key' : '');
if (!apiKey) throw new Error('Set TTS_API_KEY when listening beyond localhost');
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Invalid PORT');
const server = createLocalServer(handler, apiKey);
server.listen(port, host, () => {
  console.log(
    `TTS API: http://${host}:${port}/tts (Polly: AWS credentials required)`
  );
});
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => server.close());
