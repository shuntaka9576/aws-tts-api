import {
  PollyClient,
  SynthesizeSpeechCommand,
  type Engine,
  type VoiceId,
} from '@aws-sdk/client-polly';
import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';

const client = new PollyClient({
  region: process.env.AWS_REGION,
  maxAttempts: 2,
});
const error = (statusCode: number, message: string): APIGatewayProxyResult => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify({ message }),
});

export function createHandler(
  synthesize: (text: string) => Promise<Uint8Array>
): APIGatewayProxyHandler {
  return async (event) => {
    const contentType = Object.entries(event.headers).find(
      ([name]) => name.toLowerCase() === 'content-type'
    )?.[1];
    if (
      contentType?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
    ) {
      return error(415, 'Content-Type must be application/json');
    }
    const body = event.isBase64Encoded
      ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
      : (event.body ?? '');
    if (Buffer.byteLength(body) > 16384)
      return error(413, 'Request body too large');
    let input: unknown;
    try {
      input = JSON.parse(body);
    } catch {
      return error(400, 'Invalid JSON');
    }
    if (
      !input ||
      typeof input !== 'object' ||
      !('text' in input) ||
      typeof input.text !== 'string'
    ) {
      return error(400, 'text must be a string');
    }
    const text = input.text.trim();
    if (!text || Array.from(text).length > 1000)
      return error(400, 'text must contain 1 to 1000 characters');
    try {
      const bytes = await synthesize(text);
      if (!bytes.length) throw new Error('EmptyAudioStream');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
        isBase64Encoded: true,
        body: Buffer.from(bytes).toString('base64'),
      };
    } catch (cause) {
      // Do not log the reply text or device API key.
      console.error(
        'Speech synthesis failed',
        cause instanceof Error ? cause.name : 'UnknownError'
      );
      return error(502, 'Speech synthesis failed');
    }
  };
}

export const handler = createHandler(async (text) => {
  const response = await client.send(
    new SynthesizeSpeechCommand({
      Text: text,
      TextType: 'text',
      LanguageCode: 'ja-JP',
      VoiceId: (process.env.POLLY_VOICE_ID ?? 'Kazuha') as VoiceId,
      Engine: (process.env.POLLY_ENGINE ?? 'neural') as Engine,
      OutputFormat: 'mp3',
      SampleRate: '16000',
    }),
    { abortSignal: AbortSignal.timeout(20000) }
  );
  if (!response.AudioStream) throw new Error('EmptyAudioStream');
  return response.AudioStream.transformToByteArray();
});
