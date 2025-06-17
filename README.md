# Bedrock voice integration

This CDK project deploys an architecture that enables Bedrock voice communication via API gateway. Any application that can send and receive audio (as Base-64 encoded audio string) can use this backend to connect with Bedrock features. The next resources are deployed in this stack:

1. Lambda functions (Python runtime):
   - Amazon transcribe. For converting user query to text.
   - Knowledge base + Polly. For querying a Bedrock KB and converting the response to audio.
2. Bedrock Knowledge Base with an Opensearch database and a s3 bucket as datasource.
3. API Gateway to expose lambda functions to REST endpoints.
4. IAM roles and permissions for secure access to AWS services.

## Architecture

![Diagram](/img/diagram.png)

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 14.x or later
- AWS CDK v2 installed (`npm install -g aws-cdk`)
- Python 3.9 or later

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Build the project:
   ```
   npm run build
   ```

3. Bootstrap your AWS environment (if you haven't already):
   ```
   cdk bootstrap
   ```

4. Deploy the stack:
   ```
   cdk deploy
   ```

## API Endpoints

After deployment, you'll have two API endpoints:

1. **Knowledge Base + Polly**: `POST /knowledge-base/query`
   - Request body: `{ "prompt": "your question here", "sessionid": "optional-session-id" }`
   - Response: 
     ```json
     {
       "generated_response": "Answer from knowledge base",
       "session_id": "session-id-for-continuity",
       "audio_data": "base64-encoded-audio",
       "executionTime": "execution time details"
     }
     ```

2. **Transcribe**: `POST /transcribe`
   - Request body: `{ "audioData": "base64-encoded-audio" }`
   - Response: 
     ```json
     {
       "transcript": "Transcribed text",
       "executionTime": "execution time details",
       "message": "Audio processed successfully"
     }
     ```

## Lambda Functions

### Knowledge Base + Polly Function

Located in `lambda/queryKnowledgeBase/src/kb_polly_function.py`, this function:
- Sends the query to the Bedrock knowledge base
- Converts the text response to speech using Amazon Polly
- Returns base64-encoded audio

### Transcribe Function

Located in `lambda/transcribe/src/transcribe_function.py`, this function:
- Accepts base64-encoded audio
- Converts the audio to text using Amazon Transcribe streaming
- Returns the transcribed text

## Customization

- Modify the Lambda functions in the `lambda` directory to implement specific business logic
- Update the CDK stack in `lib/cdk-stack.ts` to add additional resources or modify configurations
- Adjust IAM permissions as needed for your specific use case
- Modify the Bedrock knowledge base configuration in the CDK stack

## Useful Commands

* `npm run build`   compile TypeScript to JavaScript
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
