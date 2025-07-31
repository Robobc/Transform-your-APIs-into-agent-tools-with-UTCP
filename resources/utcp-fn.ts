import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

// UTCP Types (from typescript-utcp repository)
interface ToolInputOutputSchema {
  type: string;
  properties: Record<string, any>;
  required?: string[];
  description?: string;
  title?: string;
  items?: Record<string, any>;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  format?: string;
}

interface HttpProvider {
  name?: string;
  provider_type: 'http';
  http_method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  content_type: string;
  auth?: {
    auth_type: 'api_key';
    api_key: string;
    var_name: string;
    location: 'header' | 'query' | 'cookie';
  };
  headers?: Record<string, string>;
  body_field?: string;
  header_fields?: string[];
}

interface Tool {
  name: string;
  description: string;
  inputs: ToolInputOutputSchema;
  outputs: ToolInputOutputSchema;
  tags: string[];
  average_response_size?: number;
  tool_provider: HttpProvider;
}

interface UtcpManual {
  version: string;
  tools: Tool[];
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);
  
  const apiUrl = process.env.API_URL || '';
  
  const tools: Tool[] = [
    {
      name: 'get_unprotected_data',
      description: 'Get data from the unprotected endpoint',
      inputs: {
        type: 'object',
        properties: {},
        required: []
      },
      outputs: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Response message' }
        },
        required: ['message']
      },
      tags: ['api', 'unprotected'],
      tool_provider: {
        name: 'unprotected_provider',
        provider_type: 'http',
        http_method: 'GET',
        url: `${apiUrl}/unprotected`,
        content_type: 'application/json'
      }
    },
    {
      name: 'get_protected_data',
      description: 'Get data from the protected endpoint (requires JWT authentication)',
      inputs: {
        type: 'object',
        properties: {
          authorization: { 
            type: 'string', 
            description: 'JWT token for authentication (Bearer token format)' 
          }
        },
        required: ['authorization']
      },
      outputs: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Response message' }
        },
        required: ['message']
      },
      tags: ['api', 'protected', 'jwt', 'auth'],
      tool_provider: {
        name: 'protected_provider',
        provider_type: 'http',
        http_method: 'GET',
        url: `${apiUrl}/protected`,
        content_type: 'application/json',
        auth: {
          auth_type: 'api_key',
          api_key: '$authorization',
          var_name: 'Authorization',
          location: 'header'
        }
      }
    }
  ];

  const manual: UtcpManual = {
    version: '0.1.1',
    tools
  };

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(manual, null, 2)
  };
}