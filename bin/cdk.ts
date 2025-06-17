#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { BedrockVoiceKnowledgeStack } from '../lib/cdk-stack';

const app = new cdk.App();
new BedrockVoiceKnowledgeStack(app, 'BedrockVoiceKnowledgeStack', {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
  
  description: 'AWS CDK stack for Bedrock knowledge base with voice integration, transcription, and API Gateway',
});
