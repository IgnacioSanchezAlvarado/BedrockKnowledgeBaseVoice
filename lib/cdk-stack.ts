import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { bedrock } from '@cdklabs/generative-ai-cdk-constructs';

export class BedrockVoiceKnowledgeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create S3 bucket for document storage
    const documentBucket = new s3.Bucket(this, 'DocumentBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development only, use RETAIN for production
      autoDeleteObjects: true, // For development only, remove for production
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // Block all public access
      encryption: s3.BucketEncryption.S3_MANAGED, // Enable default encryption
    });

    // Create IAM role for Lambda functions
    const lambdaServiceRole = new iam.Role(this, 'LambdaServiceRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Add Bedrock permissions for Lambda
    lambdaServiceRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'bedrock:InvokeModel',
        'bedrock:Retrieve',
        'bedrock:RetrieveAndGenerate',
        'bedrock:ListKnowledgeBases',
        'bedrock:GetKnowledgeBase',
        'bedrock:UpdateKnowledgeBase',
        'bedrock:CreateKnowledgeBase',
        'bedrock:DeleteKnowledgeBase',
        'bedrock-agent:*',
        'bedrock-agent-runtime:*',
      ],
      resources: ['*'], // In production, scope this down to specific resources
    }));

    // Add Polly permissions for Lambda
    lambdaServiceRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'polly:SynthesizeSpeech',
        'polly:DescribeVoices',
      ],
      resources: ['*'],
    }));

    // Add Transcribe permissions for Lambda
    lambdaServiceRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'transcribe:StartStreamTranscription',
        'transcribe:StartStreamTranscriptionWebSocket',
      ],
      resources: ['*'],
    }));

    // Add S3 permissions for Lambda
    lambdaServiceRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:ListBucket',
      ],
      resources: [
        documentBucket.bucketArn,
        `${documentBucket.bucketArn}/*`,
      ],
    }));

    // Create a separate IAM role for Bedrock Knowledge Base
    const bedrockServiceRole = new iam.Role(this, 'BedrockServiceRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
    });

    // Add S3 permissions for Bedrock Knowledge Base
    bedrockServiceRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:ListBucket',
      ],
      resources: [
        documentBucket.bucketArn,
        `${documentBucket.bucketArn}/*`,
      ],
    }));

    bedrockServiceRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'bedrock:InvokeModel'
      ],
      resources: ['*'],
    }));

    // Create a Bedrock Knowledge Base using the higher-level construct
    const knowledgeBase = new bedrock.VectorKnowledgeBase(this, 'VectorKnowledgeBase', {
      embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V1,
      name: 'VoiceEnabledKnowledgeBase',
      description: 'Vector knowledge base with voice capabilities',
      existingRole: bedrockServiceRole,
    });
    
    // Add S3 bucket as a data source for the knowledge base
    const s3DataSource = new bedrock.S3DataSource(this, 'S3DataSource', {
      bucket: documentBucket,
      knowledgeBase: knowledgeBase,
      dataSourceName: 'DocumentSource',
      chunkingStrategy: bedrock.ChunkingStrategy.fixedSize({
        maxTokens: 500,
        overlapPercentage: 20,
      }),
    });

    // Create Lambda layer for Transcribe streaming
    const transcribeLayer = new lambda.LayerVersion(this, 'TranscribeLayer', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/layers/transcribe_streaming.zip')),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_13],
      description: 'Layer containing Amazon Transcribe streaming SDK',
    });

    // Create the Speech-to-Text Lambda function
    const speechToTextFunction = new lambda.Function(this, 'SpeechToTextFunction', {
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'transcribe_function.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/transcribe/src')),
      role: lambdaServiceRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      layers: [transcribeLayer],
      environment: {
        REGION: this.region,
      },
    });

    // Create the Knowledge Base Query with Voice Response Lambda function
    const queryWithVoiceFunction = new lambda.Function(this, 'QueryWithVoiceFunction', {
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'kb_polly_function.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/queryKnowledgeBase/src')),
      role: lambdaServiceRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        KNOWLEDGE_BASE_ID: knowledgeBase.knowledgeBaseId,
        REGION: this.region,
        DATA_SOURCE_ID: s3DataSource.dataSourceId,
      },
    });

    // Create API Gateway
    const api = new apigateway.RestApi(this, 'MultimodalKnowledgeApi', {
      restApiName: 'Bedrock Voice Knowledge API',
      description: 'API for interacting with a Bedrock knowledge base using voice and text',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
      },
    });

    // Create API resources and methods
    const knowledgeBaseResource = api.root.addResource('knowledge-base');
    
    // Query endpoint with voice response integration
    const queryResource = knowledgeBaseResource.addResource('query');
    queryResource.addMethod('POST', new apigateway.LambdaIntegration(queryWithVoiceFunction));
    
    // Speech-to-text endpoint
    const transcribeResource = api.root.addResource('transcribe');
    transcribeResource.addMethod('POST', new apigateway.LambdaIntegration(speechToTextFunction));

    // Output the API URL
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'URL of the API Gateway',
    });

    // Output the Knowledge Base ID
    new cdk.CfnOutput(this, 'KnowledgeBaseId', {
      value: knowledgeBase.knowledgeBaseId,
      description: 'ID of the created Bedrock Knowledge Base',
    });
    
    // Output the Data Source ID
    new cdk.CfnOutput(this, 'DataSourceId', {
      value: s3DataSource.dataSourceId,
      description: 'ID of the S3 data source',
    });

    // Output the S3 bucket name
    new cdk.CfnOutput(this, 'DocumentBucketName', {
      value: documentBucket.bucketName,
      description: 'Name of the S3 bucket for document storage',
    });
  }
}
