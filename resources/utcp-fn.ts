import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { OpenApiConverter } from '@utcp/sdk/dist/src/client/openapi-converter';
import { UtcpManual, UtcpManualSchema } from '@utcp/sdk/dist/src/shared/utcp-manual';
import { Tool } from '@utcp/sdk/dist/src/shared/tool';

// Package version
const PACKAGE_VERSION = '0.1.1';

// OpenAPI specifications (embedded as JSON)
const unprotectedApiSpec = {
  "openapi": "3.0.3",
  "info": {
    "title": "Unprotected API",
    "description": "Public endpoints that don't require authentication",
    "version": "1.0.0"
  },
  "servers": [
    {
      "url": "{baseUrl}"
    }
  ],
  "paths": {
    "/unprotected": {
      "get": {
        "operationId": "get_unprotected_data",
        "summary": "Get data from unprotected endpoint",
        "description": "Retrieve data from a public endpoint that doesn't require authentication",
        "tags": ["public", "unprotected", "api"],
        "responses": {
          "200": {
            "description": "Successful response",
            "content": {
              "text/plain": {
                "schema": {
                  "type": "string",
                  "description": "Response message",
                  "example": "Hello Unprotected Space!"
                }
              }
            }
          },
          "500": {
            "description": "Internal server error",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "description": "Error message"
                    }
                  },
                  "required": ["error"]
                }
              }
            }
          }
        }
      }
    }
  }
};

const protectedApiSpec = {
  "openapi": "3.0.3",
  "info": {
    "title": "Protected API",
    "description": "Secure endpoints that require JWT authentication",
    "version": "1.0.0"
  },
  "servers": [
    {
      "url": "{baseUrl}"
    }
  ],
  "paths": {
    "/protected": {
      "get": {
        "operationId": "get_protected_data",
        "summary": "Get data from protected endpoint",
        "description": "Retrieve data from a secure endpoint that requires JWT authentication",
        "tags": ["protected", "jwt", "auth", "api"],
        "security": [
          {
            "JWTAuth": []
          }
        ],
        "parameters": [
          {
            "name": "Authorization",
            "in": "header",
            "required": true,
            "description": "JWT Bearer token for authentication",
            "schema": {
              "type": "string",
              "pattern": "^Bearer .+",
              "example": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response",
            "content": {
              "text/plain": {
                "schema": {
                  "type": "string",
                  "description": "Response message",
                  "example": "Hello Protected Space!"
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized - Invalid or missing JWT token",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "description": "Error message"
                    }
                  },
                  "required": ["error"]
                }
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "securitySchemes": {
      "JWTAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "description": "JWT token obtained from Cognito authentication"
      }
    }
  }
};

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

function updateApiSpecWithBaseUrl(spec: any, baseUrl: string): any {
  const updatedSpec = JSON.parse(JSON.stringify(spec)); // Deep clone
  if (updatedSpec.servers && updatedSpec.servers[0]) {
    updatedSpec.servers[0].url = baseUrl;
  }
  return updatedSpec;
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);
  
  const apiUrl = process.env.API_URL || '';
  const authenticated = await isAuthenticated(event);
  
  console.log(`Request authenticated: ${authenticated}`);

  try {
    // Update API specs with the actual base URL
    const updatedUnprotectedSpec = updateApiSpecWithBaseUrl(unprotectedApiSpec, apiUrl);
    
    // Convert unprotected OpenAPI spec to UTCP tools
    const unprotectedConverter = new OpenApiConverter(updatedUnprotectedSpec, {
      providerName: 'unprotected_provider'
    });
    const unprotectedManual = unprotectedConverter.convert();

    let allTools: Tool[] = [...unprotectedManual.tools];

    // If authenticated, also include protected tools
    if (authenticated) {
      const updatedProtectedSpec = updateApiSpecWithBaseUrl(protectedApiSpec, apiUrl);
      const protectedConverter = new OpenApiConverter(updatedProtectedSpec, {
        providerName: 'protected_provider'
      });
      const protectedManual = protectedConverter.convert();
      allTools = [...allTools, ...protectedManual.tools];
    }

    // Construct the UTCP manual following the library pattern
    const manual: UtcpManual = UtcpManualSchema.parse({
      version: PACKAGE_VERSION,
      tools: allTools
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Auth-Status': authenticated ? 'authenticated' : 'unauthenticated',
        'X-Tools-Count': allTools.length.toString()
      },
      body: JSON.stringify(manual, null, 2)
    };

  } catch (error) {
    console.error('Error generating UTCP manual:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: 'Failed to generate UTCP manual'
      })
    };
  }
}