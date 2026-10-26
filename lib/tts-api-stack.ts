import { fileURLToPath } from 'node:url';
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

export class TtsApiStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    const handler = new NodejsFunction(this, 'Synthesize', {
      entry: fileURLToPath(new URL('../src/tts.ts', import.meta.url)),
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: Duration.seconds(25),
      memorySize: 256,
      environment: { POLLY_VOICE_ID: 'Kazuha', POLLY_ENGINE: 'neural' },
      bundling: { bundleAwsSDK: true, minify: true, sourceMap: true },
      logGroup: new logs.LogGroup(this, 'FunctionLogs', {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });
    // SynthesizeSpeech does not support resource-level permissions.
    handler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['polly:SynthesizeSpeech'],
        resources: ['*'],
      })
    );
    const api = new apigateway.RestApi(this, 'Api', {
      restApiName: 'aws-tts-api',
      endpointTypes: [apigateway.EndpointType.REGIONAL],
      binaryMediaTypes: ['audio/mpeg'],
      cloudWatchRole: false,
      deployOptions: {
        stageName: 'v1',
        throttlingRateLimit: 2,
        throttlingBurstLimit: 5,
      },
    });
    api.root
      .addResource('tts')
      .addMethod('POST', new apigateway.LambdaIntegration(handler), {
        apiKeyRequired: true,
      });
    const key = api.addApiKey('DeviceKey');
    const plan = api.addUsagePlan('DevicePlan', {
      throttle: { rateLimit: 1, burstLimit: 2 },
      quota: { limit: 1000, period: apigateway.Period.MONTH },
    });
    plan.addApiKey(key);
    plan.addApiStage({ stage: api.deploymentStage });
    new CfnOutput(this, 'TtsEndpoint', { value: `${api.url}tts` });
    new CfnOutput(this, 'ApiKeyId', { value: key.keyId });
  }
}
