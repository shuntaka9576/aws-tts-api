import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
const send = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-polly', async (original) => {
  const actual = await original<typeof import('@aws-sdk/client-polly')>();
  return {
    ...actual,
    PollyClient: class {
      send = send;
    },
  };
});
import { handler } from '../src/tts.js';
const invoke = (body: string, isBase64Encoded = false) =>
  handler(
    {
      body,
      isBase64Encoded,
      headers: { 'Content-Type': 'application/json' },
    } as unknown as APIGatewayProxyEvent,
    {} as Context,
    () => {}
  );
beforeEach(() => {
  send.mockReset();
});
describe('TTS API', () => {
  it.each([
    'invalid',
    '{}',
    '{"text":42}',
    '{"text":" "}',
    JSON.stringify({ text: 'あ'.repeat(1001) }),
  ])('rejects invalid input without calling Polly: %s', async (body) => {
    expect(await invoke(body)).toMatchObject({ statusCode: 400 });
    expect(send).not.toHaveBeenCalled();
  });
  it('returns exact MP3 bytes and requests plain Japanese text', async () => {
    const bytes = new Uint8Array([255, 251, 1, 2]);
    send.mockResolvedValue({
      AudioStream: { transformToByteArray: async () => bytes },
    });
    const result = await invoke(
      Buffer.from(JSON.stringify({ text: 'こんにちは' })).toString('base64'),
      true
    );
    expect(result).toMatchObject({
      statusCode: 200,
      isBase64Encoded: true,
      body: Buffer.from(bytes).toString('base64'),
      headers: { 'Content-Type': 'audio/mpeg' },
    });
    expect(send.mock.calls[0][0].input).toMatchObject({
      Text: 'こんにちは',
      TextType: 'text',
      OutputFormat: 'mp3',
      SampleRate: '16000',
      VoiceId: 'Kazuha',
    });
  });
  it('returns a generic upstream failure', async () => {
    send.mockImplementation(async () => {
      throw new Error('private upstream detail');
    });
    expect(await invoke('{"text":"こんにちは"}')).toMatchObject({
      statusCode: 502,
      body: '{"message":"Speech synthesis failed"}',
    });
  });
  it('rejects oversized payloads', async () => {
    expect(await invoke(' '.repeat(16385))).toMatchObject({ statusCode: 413 });
  });
});
