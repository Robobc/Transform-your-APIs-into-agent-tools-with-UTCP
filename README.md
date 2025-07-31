# Transform your (Serverless) APIs into agent tools with UTCP - DEMO

This sample demonstrates how enterprise customers can enable AI agents to securely discover and interact with their existing APIs using the Universal Tool Calling Protocol (UTCP). Built on top of the [Amazon API Gateway HTTP API with Cognito JWT and AWS Lambda integration](https://github.com/aws-samples/serverless-patterns/tree/main/apigw-http-api-cognito-lambda-cdk) pattern, this example shows how to transform existing APIs into AI-discoverable tools without breaking changes.

## What is UTCP?

UTCP (Universal Tool Calling Protocol) is a standardized protocol that makes APIs discoverable and callable by AI agents. It provides:

- **Zero API Changes**: Your existing endpoints remain unchanged
- **AI Agent Discoverability**: Agents can automatically discover and understand API capabilities
- **Standardized Interface**: Uniform JSON Schema format compatible with all AI frameworks
- **Authentication Abstraction**: Clear auth requirements in standard format
- **Enterprise Security**: Supports JWT, API keys, OAuth2, and other auth methods

## Architecture

This pattern creates:
- Amazon API Gateway HTTP API with three endpoints:
  - `/unprotected` - Public endpoint (no authentication)
  - `/protected` - Secured with Cognito JWT authentication
  - `/utcp` - UTCP discovery endpoint (protected with JWT)
- AWS Lambda functions for each endpoint
- Amazon Cognito User Pool for authentication
- UTCP manual that describes available tools to AI agents

## Enterprise Benefits

1. **Secure AI Integration**: AI agents can only discover and use APIs after proper authentication
2. **Self-Documenting APIs**: The `/utcp` endpoint serves as both documentation and executable specification
3. **Framework Agnostic**: Works with Claude, GPT, Bedrock, and other AI platforms
4. **Future-Proof**: Supports multiple transport mechanisms (HTTP, WebSocket, CLI, gRPC)
5. **Zero Breaking Changes**: Existing API clients continue to work unchanged

Important: this application uses various AWS services and there are costs associated with these services after the Free Tier usage - please see the [AWS Pricing page](https://aws.amazon.com/pricing/) for details. You are responsible for any AWS costs incurred. No warranty is implied in this example.

## Requirements

* [Create an AWS account](https://portal.aws.amazon.com/gp/aws/developer/registration/index.html) if you do not already have one and log in. The IAM user that you use must have sufficient permissions to make necessary AWS service calls and manage AWS resources.
* [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) installed and configured
* [Git Installed](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
* [AWS Cloud Development Kit](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html) (AWS CDK) installed

## Deployment Instructions

1. Create a new directory, navigate to that directory in a terminal and clone the GitHub repository:
    ```bash 
    git clone https://github.com/Robobc/Transform-your-APIs-into-agent-tools-with-UTCP.git
    ```

1. Change directory to the pattern directory:
    ```bash
    cd Transform-your-APIs-into-agent-tools-with-UTCP
    ```

1. Install dependencies
    ```bash
    npm install
    ```

1. Deploy the stack to your default AWS account and region. The output of this command should give you the HTTP API URL.
    ```bash
    cdk deploy
    ```

1. Note the outputs from the CDK deployment process. These contain the resource names and/or ARNs which are used for testing.

## How it works

This pattern demonstrates enterprise-grade AI agent integration by:

1. **API Discovery**: AI agents call the `/utcp` endpoint to discover available tools
2. **Authentication**: Agents authenticate using Cognito JWT tokens for secure access
3. **Tool Execution**: Agents call the actual API endpoints using the discovered tool definitions
4. **Standardized Response**: All interactions follow UTCP protocol standards

The pattern includes:
- **Unprotected endpoint** (`/unprotected`): Demonstrates public API integration
- **Protected endpoint** (`/protected`): Shows secure API access with JWT authentication
- **UTCP endpoint** (`/utcp`): Provides tool discovery for AI agents (JWT protected)

Each API endpoint is automatically described in the UTCP manual with proper authentication requirements, input/output schemas, and execution details.

## Testing

**Pre-requisites**
1. Export the variables with the outputs of your stack.
   ```bash
     # Get the stack name (adjust the filter if your stack has a different naming pattern)
     export STACK_NAME=$(aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE --query 'StackSummaries[?contains(StackName, `Transform`) || contains(StackName, `Utcp`) || contains(StackName, `Api`)].StackName' --output text)
     
     # Extract values from CloudFormation stack outputs
     export API_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`HttpApiURL`].OutputValue' --output text)
     export POOL_ID=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' --output text)
     export CLIENT_ID=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' --output text)
     
     # Export the AWS region (needed for Python script)
     export AWS_DEFAULT_REGION=$(aws configure get region)

     echo "API_URL: $API_URL"
     echo "POOL_ID: $POOL_ID"
     echo "CLIENT_ID: $CLIENT_ID"
     echo "AWS_DEFAULT_REGION: $AWS_DEFAULT_REGION"
   ```
2. Export the variables for the fake user to be created
   ```bash
     export EMAIL="fake@example.com"                                
     export PASSWORD="S3cuRe#FaKE*"
   ```

**Unprotected endpoint**
To test the unprotected endpoint, send a HTTP GET request command to the HTTP API unprotected endpoint. Be sure to update the endpoint with outputs of your stack. The response payload should shows `Hello Unprotected Space`.
```bash
curl ${API_URL}/unprotected
```
**Protected endpoint**
To test the protected endpoint:

First sign-up the fake user against Cognito.
```bash
 aws cognito-idp sign-up \
 --client-id ${CLIENT_ID} \
 --username ${EMAIL} \
 --password ${PASSWORD}
```
Confirm the fake user to Cognito
 ```bash
 aws cognito-idp admin-confirm-sign-up \
 --user-pool-id ${POOL_ID} \
 --username ${EMAIL}
```
Then you send the authentication data and Cognito will return the token.
 ```bash
TOKEN=$(aws cognito-idp initiate-auth \
 --client-id ${CLIENT_ID} \
 --auth-flow USER_PASSWORD_AUTH \
 --auth-parameters USERNAME=${EMAIL},PASSWORD=${PASSWORD} \
 --query 'AuthenticationResult.AccessToken' \
 --output text)
```
Send an HTTP GET request to the API Gateway with the JWT token, which will verify the token call the protected Lambda function.
 ```bash
curl -H "Authorization: ${TOKEN}" ${API_URL}/utcp
```

This returns a UTCP manual describing all available tools:
```json
{
  "version": "0.1.1",
  "tools": [
    {
      "name": "get_unprotected_data",
      "description": "Get data from the unprotected endpoint",
      "tool_provider": {
        "provider_type": "http",
        "url": "https://your-api.amazonaws.com/unprotected",
        "http_method": "GET"
      }
    },
    {
      "name": "get_protected_data",
      "description": "Get data from the protected endpoint",
      "tool_provider": {
        "provider_type": "http",
        "url": "https://your-api.amazonaws.com/protected",
        "http_method": "GET",
        "auth": {
          "auth_type": "api_key",
          "var_name": "Authorization",
          "location": "header"
        }
      }
    }
  ]
}
```

## AI Agent Integration

**Testing with Claude via Amazon Bedrock**

A sample Python script (`test_claude_bedrock.py`) demonstrates how AI agents can:
1. Authenticate with Cognito
2. Discover tools via the `/utcp` endpoint
3. Execute tools using the discovered definitions
4. Handle responses in a conversational manner

To run the AI agent test:
```bash
pip install boto3 requests
python test_claude_bedrock.py
```

The script shows how enterprise customers can enable AI agents to securely interact with their APIs without manual configuration or hardcoded endpoints.
 

## Cleanup
 
Run the given command to delete the resources that were created. It might take some time for the CloudFormation stack to get deleted.
```bash
cdk destroy
```

## Enterprise Considerations

**Security**
- UTCP discovery endpoint is protected with JWT authentication
- Tool execution maintains original API security requirements
- No exposure of internal API details to unauthorized agents

**Scalability**
- Add new tools by updating the UTCP manual - no client changes needed
- Supports multiple AI frameworks and agent architectures
- Compatible with existing API management and monitoring tools

**Compliance**
- Maintains audit trails through existing API Gateway logging
- Supports enterprise authentication and authorization patterns
- No changes to existing API contracts or SLAs

## References

- Original pattern: [Amazon API Gateway HTTP API with Cognito JWT and AWS Lambda integration](https://github.com/aws-samples/serverless-patterns/tree/main/apigw-http-api-cognito-lambda-cdk)
- UTCP Specification: [Universal Tool Calling Protocol](https://github.com/aws-samples/serverless-patterns)
- Learn more at Serverless Land Patterns: [https://serverlessland.com/patterns/apigw-http-api-cognito-lambda-cdk](https://serverlessland.com/patterns/apigw-http-api-cognito-lambda-cdk)

----
SPDX-License-Identifier: MIT-0
