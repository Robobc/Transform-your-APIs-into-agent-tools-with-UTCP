import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

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

// Initialize JWT verifier (will be configured with environment variables)
let jwtVerifier: CognitoJwtVerifier | null = null;

async function initializeJwtVerifier() {
  if (!jwtVerifier && process.env.USER_POOL_ID && process.env.CLIENT_ID) {
    jwtVerifier = CognitoJwtVerifier.create({
      userPoolId: process.env.USER_POOL_ID,
      tokenUse: 'access',
      clientId: process.env.CLIENT_ID,
    });
  }
}

async function isAuthenticated(event: APIGatewayProxyEventV2): Promise<boolean> {
  try {
    await initializeJwtVerifier();
    
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader || !jwtVerifier) {
      return false;
    }

    // Extract token from "Bearer <token>" format
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    
    // Verify the JWT token
    await jwtVerifier.verify(token);
    return true;
  } catch (error) {
    console.log('Authentication failed:', error);
    return false;
  }
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);
  
  const apiUrl = process.env.API_URL || '';
  const authenticated = await isAuthenticated(event);
  
  console.log(`Request authenticated: ${authenticated}`);

  // Define unprotected tools (always available)
  const unprotectedTools: Tool[] = [
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
      tags: ['api', 'unprotected', 'public'],
      tool_provider: {
        name: 'unprotected_provider',
        provider_type: 'http',
        http_method: 'GET',
        url: `${apiUrl}/unprotected`,
        content_type: 'application/json'
      }
    }
  ];

  // Define protected tools (only available when authenticated)
  const protectedTools: Tool[] = [
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

  // Return tools based on authentication status
  const tools = authenticated ? [...unprotectedTools, ...protectedTools] : unprotectedTools;

  const manual: UtcpManual = {
    version: '0.1.1',
    tools
  };

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-Auth-Status': authenticated ? 'authenticated' : 'unauthenticated',
      'X-Tools-Count': tools.length.toString()
    },
    body: JSON.stringify(manual, null, 2)
  };
}