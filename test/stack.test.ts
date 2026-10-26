import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { expect, it } from 'vitest';
import { TtsApiStack } from '../lib/tts-api-stack.js';
it('requires a managed API key and configures binary audio and least-privilege Polly access', () => {
  const template = Template.fromStack(new TtsApiStack(new App(), 'Test'));
  template.hasResourceProperties('AWS::ApiGateway::Method', {
    HttpMethod: 'POST',
    ApiKeyRequired: true,
  });
  template.hasResourceProperties('AWS::ApiGateway::RestApi', {
    BinaryMediaTypes: ['audio/mpeg'],
  });
  template.hasResourceProperties('AWS::ApiGateway::UsagePlan', {
    Quota: { Limit: 1000, Period: 'MONTH' },
  });
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({ Action: 'polly:SynthesizeSpeech', Resource: '*' }),
      ]),
    },
  });
  expect(JSON.stringify(template.toJSON())).not.toContain('polly:*');
});
