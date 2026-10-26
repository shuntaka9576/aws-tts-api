import { App } from 'aws-cdk-lib';
import { TtsApiStack } from '../lib/tts-api-stack.js';

const app = new App();
new TtsApiStack(app, 'AwsTtsApi', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-1',
  },
});
