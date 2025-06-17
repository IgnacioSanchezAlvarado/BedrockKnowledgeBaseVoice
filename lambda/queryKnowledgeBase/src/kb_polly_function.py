import boto3
import json
import base64
from datetime import datetime
import time
import re
import os

bedrock_agent = boto3.client('bedrock-agent-runtime')

def text_to_speech(text):
    # Initialize Polly client
    polly_client = boto3.client('polly')

    voice_id, engine_type = "Matthew", "neural"

    try:
        # Request speech synthesis
        response = polly_client.synthesize_speech(
            Engine= engine_type,
            Text=text,
            OutputFormat='pcm',
            SampleRate='16000',
            VoiceId= voice_id,
            TextType='text'
        )
        
        # Get the audio stream from the response
        audio_stream = response['AudioStream'].read()
        
        # Encode the audio stream to base64
        audio_base64 = base64.b64encode(audio_stream).decode('utf-8')
        
        return audio_base64
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return None

def lambda_handler(event, context):
    start_time = time.time()
    body = json.loads(event['body'])
    # Get parameters from the event
    print(body)
    query = body.get('prompt', '')
    session_id = body.get('sessionid', 'none')
    kb_id = os.environ.get('KNOWLEDGE_BASE_ID')
    model_arn = "us.amazon.nova-pro-v1:0"
    
    # Initialize retrieval config
    retrieval_config = {
        'vectorSearchConfiguration': {
            'numberOfResults': 3
        }
    }

    try:
        retrieve_and_generate_params = {
            'input': {
                'text': query
            },
            'retrieveAndGenerateConfiguration': {
                'type': 'KNOWLEDGE_BASE',
                'knowledgeBaseConfiguration': {
                    'knowledgeBaseId': kb_id,
                    'modelArn': model_arn,
                    'retrievalConfiguration': retrieval_config,
                    'generationConfiguration': {
                        "inferenceConfig": { 
                           "textInferenceConfig": { 
                              "maxTokens": 220 ## Limiting output length 
                               }
                           },
                        'promptTemplate': {
                            'textPromptTemplate': """
                                You are a question answering agent. I will provide you with a set of search results. The user will provide you with a question. Your job is to answer the user's question using information from the search results. 
                                Maintain a conversational and educational style. Be concise and provide short answers. Use less than 5 sentences when possible.
                                Always answer in the same language that the user is asking.
                                
                                Here are the search results in numbered order:
                                $search_results$
                                
                                $output_format_instructions$
        
                            """
                        }
                    }
                }
            }
        }
        
        # Add sessionId to params if provided
        if session_id != 'none':
            retrieve_and_generate_params['sessionId'] = session_id

        response = bedrock_agent.retrieve_and_generate(**retrieve_and_generate_params)

        # Get the session ID from the response for subsequent calls
        new_session_id = response.get('sessionId', '')

        kb_response = response['output']['text']

        print(f"kb response: {response}")

        clean_response = re.sub(r'\*\*', '', kb_response)  # Remove asterisks
        clean_response = re.sub(r'\n+', ' ', clean_response)  # Replace line breaks with spaces
        clean_response = re.sub(r'\s+', ' ', clean_response)  # Normalize spaces (replace multiple spaces with single space)

        KB_time = time.time() 
        KB_execution = KB_time - start_time

        # Generate audio from the text
        audio_data = text_to_speech(response['output']['text'])

        Polly_time = time.time()
        Polly_execution = Polly_time - KB_time

        total_execution_time = time.time() - start_time

        return {
                'statusCode': 200,
                'body': json.dumps({
                    'generated_response': clean_response,
                    'session_id': new_session_id,
                    'audio_data': audio_data,
                    'executionTime': f'{total_execution_time:.2f} seconds. kb: {KB_execution}, polly: {Polly_execution}'
                })
            }

    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e)
            })
        }
