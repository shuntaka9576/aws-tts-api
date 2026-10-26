import { createServer } from 'node:http';
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  Context,
} from 'aws-lambda';

export function createLocalServer(
  handler: APIGatewayProxyHandler,
  apiKey: string
) {
  return createServer(async (request, response) => {
    const json = (status: number, message: string) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ message }));
    };
    if (request.url !== '/tts') return json(404, 'Not found');
    if (request.method !== 'POST') return json(405, 'Method not allowed');
    if (request.headers['x-api-key'] !== apiKey) return json(403, 'Forbidden');
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        const buffer = Buffer.from(chunk);
        size += buffer.length;
        if (size > 16384) return json(413, 'Request body too large');
        chunks.push(buffer);
      }
      const event = {
        body: Buffer.concat(chunks).toString('utf8'),
        isBase64Encoded: false,
        headers: Object.fromEntries(
          Object.entries(request.headers).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.join(',') : value,
          ])
        ),
        httpMethod: 'POST',
        path: '/tts',
        resource: '/tts',
        multiValueHeaders: {},
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {},
      } as APIGatewayProxyEvent;
      const result = await handler(event, {} as Context, () => {});
      if (!result) return json(500, 'Handler returned no response');
      response.writeHead(
        result.statusCode,
        Object.fromEntries(
          Object.entries(result.headers ?? {}).map(([key, value]) => [
            key,
            String(value),
          ])
        )
      );
      response.end(
        Buffer.from(result.body, result.isBase64Encoded ? 'base64' : 'utf8')
      );
    } catch {
      if (!response.headersSent) json(500, 'Internal server error');
      else response.end();
    }
  });
}
