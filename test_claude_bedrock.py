import boto3
import requests
import json

# Configuration
API_URL = "https://7xkzkojyfi.execute-api.us-east-1.amazonaws.com/"  # Replace with your API URL
REGION = "us-east-1"  # Replace with your region
POOL_ID = "us-east-1_Wmwra3jGh"  # Replace with your Cognito User Pool ID
CLIENT_ID = "2oq563ge84k0upqmbgdsm6hu07"  # Replace with your Cognito Client ID
EMAIL = "fake@example.com"
PASSWORD = "S3cuRe#FaKE*"

def get_jwt_token():
    """Get JWT token from Cognito"""
    cognito = boto3.client('cognito-idp', region_name=REGION)
    
    try:
        response = cognito.initiate_auth(
            ClientId=CLIENT_ID,
            AuthFlow='USER_PASSWORD_AUTH',
            AuthParameters={
                'USERNAME': EMAIL,
                'PASSWORD': PASSWORD
            }
        )
        return response['AuthenticationResult']['AccessToken']
    except Exception as e:
        print(f"Error getting token: {e}")
        return None

def get_utcp_tools(jwt_token):
    """Fetch tools from UTCP endpoint with authentication"""
    headers = {'Authorization': jwt_token}
    response = requests.get(f"{API_URL}/utcp", headers=headers)
    return response.json()

def convert_to_bedrock_tools(utcp_manual):
    """Convert UTCP tools to Bedrock tool format"""
    bedrock_tools = []
    
    for tool in utcp_manual['tools']:
        bedrock_tool = {
            "toolSpec": {
                "name": tool['name'],
                "description": tool['description'],
                "inputSchema": {
                    "json": tool['inputs']
                }
            }
        }
        bedrock_tools.append(bedrock_tool)
    
    return bedrock_tools

def execute_tool(tool_name, inputs, utcp_manual):
    """Execute a tool based on UTCP definition"""
    for tool in utcp_manual['tools']:
        if tool['name'] == tool_name:
            provider = tool['tool_provider']
            url = provider['url']
            method = provider['http_method']
            
            headers = {'Content-Type': provider['content_type']}
            
            # Handle auth if present
            if 'auth' in provider and provider['auth']:
                auth = provider['auth']
                if auth['location'] == 'header':
                    auth_value = inputs.get('authorization', '')
                    headers[auth['var_name']] = auth_value
            
            if method == 'GET':
                response = requests.get(url, headers=headers)
            else:
                response = requests.request(method, url, headers=headers, json=inputs)
            
            return response.text
    
    return f"Tool {tool_name} not found"

def test_with_claude():
    """Test UTCP tools with Claude 4 via Bedrock"""
    # Initialize Bedrock client
    bedrock = boto3.client('bedrock-runtime', region_name=REGION)
    
    # Get JWT token first
    jwt_token = get_jwt_token()
    if not jwt_token:
        print("Failed to get JWT token")
        return
    
    # Get UTCP tools with authentication
    utcp_manual = get_utcp_tools(jwt_token)
    bedrock_tools = convert_to_bedrock_tools(utcp_manual)
    
    print(f"Discovered {len(bedrock_tools)} tools from UTCP endpoint")
    
    # Test conversation with Claude
    messages = [
        {
            "role": "user",
            "content": [{"text": f"Can you call the protected endpoint using this JWT token: {jwt_token}"}]
        }
    ]
    
    response = bedrock.converse(
        modelId="us.anthropic.claude-3-5-sonnet-20241022-v2:0",
        messages=messages,
        toolConfig={"tools": bedrock_tools}
    )
    
    # Handle tool use
    if response['output']['message'].get('content'):
        for content in response['output']['message']['content']:
            if content.get('toolUse'):
                tool_use = content['toolUse']
                tool_name = tool_use['name']
                tool_inputs = tool_use['input']
                
                print(f"Claude wants to use tool: {tool_name}")
                
                # Execute the tool
                result = execute_tool(tool_name, tool_inputs, utcp_manual)
                print(f"Tool result: {result}")
                
                # Continue conversation with tool result
                messages.append(response['output']['message'])
                messages.append({
                    "role": "user",
                    "content": [
                        {
                            "toolResult": {
                                "toolUseId": tool_use['toolUseId'],
                                "content": [{"text": result}]
                            }
                        }
                    ]
                })
                
                # Get Claude's final response
                final_response = bedrock.converse(
                    modelId="us.anthropic.claude-3-5-sonnet-20241022-v2:0",
                    messages=messages,
                    toolConfig={"tools": bedrock_tools}
                )
                
                print("Claude's response:")
                for content in final_response['output']['message']['content']:
                    if content.get('text'):
                        print(content['text'])

if __name__ == "__main__":
    test_with_claude()