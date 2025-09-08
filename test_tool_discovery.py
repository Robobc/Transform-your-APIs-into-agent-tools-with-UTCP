import boto3
import requests
import json
import os

# Configuration - using environment variables
API_URL = os.environ.get('API_URL')
REGION = os.environ.get('AWS_DEFAULT_REGION', 'us-east-1')
POOL_ID = os.environ.get('POOL_ID')
CLIENT_ID = os.environ.get('CLIENT_ID')
EMAIL = os.environ.get('EMAIL')
PASSWORD = os.environ.get('PASSWORD')

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

def discover_tools_unauthenticated():
    """Discover tools without authentication"""
    print("🔍 DISCOVERING TOOLS WITHOUT AUTHENTICATION...")
    try:
        response = requests.get(f"{API_URL}utcp")
        if response.status_code == 200:
            utcp_manual = response.json()
            tools = utcp_manual.get('tools', [])
            print(f"✅ Discovered {len(tools)} tools (unauthenticated):")
            for tool in tools:
                print(f"   - {tool['name']}: {tool['description']}")
                print(f"     Tags: {', '.join(tool['tags'])}")
            return utcp_manual
        else:
            print(f"❌ Failed to discover tools: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Error discovering tools: {e}")
        return None

def discover_tools_authenticated(jwt_token):
    """Discover tools with authentication"""
    print("\n🔐 DISCOVERING TOOLS WITH AUTHENTICATION...")
    try:
        headers = {'Authorization': jwt_token}
        response = requests.get(f"{API_URL}utcp", headers=headers)
        if response.status_code == 200:
            utcp_manual = response.json()
            tools = utcp_manual.get('tools', [])
            print(f"✅ Discovered {len(tools)} tools (authenticated):")
            for tool in tools:
                print(f"   - {tool['name']}: {tool['description']}")
                print(f"     Tags: {', '.join(tool['tags'])}")
            return utcp_manual
        else:
            print(f"❌ Failed to discover tools: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Error discovering tools: {e}")
        return None

def test_unprotected_tool_without_auth(utcp_manual):
    """Test calling the unprotected tool without authentication"""
    print("\n🌐 TESTING UNPROTECTED TOOL (WITHOUT AUTH)...")
    for tool in utcp_manual['tools']:
        if tool['name'] == 'get_unprotected_data':
            provider = tool['tool_provider']
            try:
                response = requests.get(provider['url'])
                if response.status_code == 200:
                    # Handle both JSON and plain text responses
                    try:
                        result = response.json()
                    except:
                        result = response.text
                    print(f"✅ Unprotected tool result (no auth): {result}")
                    return result
                else:
                    print(f"❌ Unprotected tool failed: {response.status_code}")
            except Exception as e:
                print(f"❌ Error calling unprotected tool: {e}")
    return None

def test_unprotected_tool_with_auth(utcp_manual, jwt_token):
    """Test calling the unprotected tool with authentication"""
    print("\n🌐 TESTING UNPROTECTED TOOL (WITH AUTH)...")
    for tool in utcp_manual['tools']:
        if tool['name'] == 'get_unprotected_data':
            provider = tool['tool_provider']
            try:
                # Test with auth header (should still work)
                headers = {'Authorization': jwt_token}
                response = requests.get(provider['url'], headers=headers)
                if response.status_code == 200:
                    # Handle both JSON and plain text responses
                    try:
                        result = response.json()
                    except:
                        result = response.text
                    print(f"✅ Unprotected tool result (with auth): {result}")
                    return result
                else:
                    print(f"❌ Unprotected tool failed: {response.status_code}")
            except Exception as e:
                print(f"❌ Error calling unprotected tool: {e}")
    return None

def test_protected_tool_without_auth(utcp_manual):
    """Test calling the protected tool without authentication (should fail)"""
    print("\n🔒 TESTING PROTECTED TOOL (WITHOUT AUTH - should fail)...")
    for tool in utcp_manual['tools']:
        if tool['name'] == 'get_protected_data':
            provider = tool['tool_provider']
            try:
                response = requests.get(provider['url'])
                if response.status_code == 200:
                    try:
                        result = response.json()
                    except:
                        result = response.text
                    print(f"❌ Unexpected success: {result}")
                    return result
                else:
                    print(f"✅ Protected tool correctly rejected (status {response.status_code}): Unauthorized access blocked")
                    return None
            except Exception as e:
                print(f"❌ Error calling protected tool: {e}")
    return None

def test_protected_tool_with_auth(utcp_manual, jwt_token):
    """Test calling the protected tool with authentication"""
    print("\n🔒 TESTING PROTECTED TOOL (WITH AUTH)...")
    for tool in utcp_manual['tools']:
        if tool['name'] == 'get_protected_data':
            provider = tool['tool_provider']
            try:
                headers = {'Authorization': jwt_token}
                response = requests.get(provider['url'], headers=headers)
                if response.status_code == 200:
                    # Handle both JSON and plain text responses
                    try:
                        result = response.json()
                    except:
                        result = response.text
                    print(f"✅ Protected tool result (with auth): {result}")
                    return result
                else:
                    print(f"❌ Protected tool failed: {response.status_code}")
            except Exception as e:
                print(f"❌ Error calling protected tool: {e}")
    return None

def main():
    print("🚀 TESTING COMPLETE DISCOVERY WITH UTCP")
    print("=" * 50)
    
    # Test 1: Discover tools without authentication
    unauthenticated_manual = discover_tools_unauthenticated()
    
    # Test 2: Get JWT token
    print("\n🎫 GETTING JWT TOKEN...")
    jwt_token = get_jwt_token()
    if not jwt_token:
        print("❌ Failed to get JWT token, stopping test")
        return
    print("✅ JWT token obtained successfully")
    
    # Test 3: Discover tools with authentication
    authenticated_manual = discover_tools_authenticated(jwt_token)
    
    # Test 4: Compare discovery results
    print("\n📊 DISCOVERY COMPARISON:")
    unauth_count = len(unauthenticated_manual['tools']) if unauthenticated_manual else 0
    auth_count = len(authenticated_manual['tools']) if authenticated_manual else 0
    print(f"   Unauthenticated: {unauth_count} tools")
    print(f"   Authenticated: {auth_count} tools")
    
    if unauth_count == auth_count:
        print("✅ Both requests return same number of tools (complete discovery)")
    else:
        print("⚠️  Different tool counts - unexpected behavior")
    
    # Test 5: Test unprotected tool without authentication (should work)
    if unauthenticated_manual:
        test_unprotected_tool_without_auth(unauthenticated_manual)
    
    # Test 6: Test unprotected tool with authentication (should also work)
    if authenticated_manual:
        test_unprotected_tool_with_auth(authenticated_manual, jwt_token)
    
    # Test 7: Test protected tool without authentication (should fail)
    if unauthenticated_manual:  # Now we can get protected tool definition from unauthenticated discovery
        test_protected_tool_without_auth(unauthenticated_manual)
    
    # Test 8: Test protected tool with authentication (should work)
    if authenticated_manual:
        test_protected_tool_with_auth(authenticated_manual, jwt_token)
    
    print("\n✨ COMPLETE DISCOVERY TEST COMPLETE!")
    print("=" * 50)
    print("Summary:")
    print("- UTCP endpoint always returns 2 tools (public + protected)")
    print("- Public tools work without authentication")
    print("- Protected tools require JWT authentication to execute")
    print("- Discovery is public, execution maintains security")
    print("- AI agents see all available capabilities upfront")

if __name__ == "__main__":
    main()
