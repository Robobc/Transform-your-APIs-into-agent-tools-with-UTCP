import { CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

export class HttpApiCognitoLambdaStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Cognito UserPool
    const userPool = new UserPool(this, 'userPool', {
      removalPolicy: RemovalPolicy.DESTROY,
      selfSignUpEnabled: true
    })

    // Cognito UserPool App Client, interacts with web application that authenticates with Amazon Cognito.
    const userPoolClient = new UserPoolClient(this, 'userPoolClient', {
      userPool: userPool,
      authFlows: { userPassword: true }
    })

    // Unprotected Accessible Lambda
    const unprotectedFn = new NodejsFunction(this, 'unprotectedFn', {
      runtime: Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '/../resources/unprotected-fn.ts'),
      handler: 'handler',
      bundling: {
        forceDockerBundling: false,
      }
    })

    // Protected Accessible Lambda
    const protectedFn = new NodejsFunction(this, 'protectedFn', {
      runtime: Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '/../resources/protected-fn.ts'),
      handler: 'handler',
      bundling: {
        forceDockerBundling: false,
      }
    })

    // UTCP Manual Lambda
    const utcpFn = new NodejsFunction(this, 'utcpFn', {
      runtime: Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '/../resources/utcp-fn.ts'),
      handler: 'handler',
      bundling: {
        forceDockerBundling: false,
      }
    })

    // HTTP API Gateway
    const httpApi = new HttpApi(this, 'httpApi', { })
    const jwtAuthorizer = new HttpJwtAuthorizer(
      'jwtAuthorizer', 
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      { 
        identitySource: ["$request.header.Authorization"],
        jwtAudience: [userPoolClient.userPoolClientId]
       })
    httpApi.addRoutes({
      path:'/unprotected',
      methods: [ HttpMethod.GET ],
      integration: new HttpLambdaIntegration('unprotectedIntegration', unprotectedFn),
      authorizer: undefined
    })
    httpApi.addRoutes({
      path:'/protected',
      methods: [ HttpMethod.GET ],
      integration: new HttpLambdaIntegration('protectedIntegration', protectedFn),
      authorizer: jwtAuthorizer
    })
    httpApi.addRoutes({
      path:'/utcp',
      methods: [ HttpMethod.GET ],
      integration: new HttpLambdaIntegration('utcpIntegration', utcpFn),
      authorizer: jwtAuthorizer
    })

    // Set API URL environment variable for UTCP function
    utcpFn.addEnvironment('API_URL', httpApi.url ?? '');

    // Outputs
    new CfnOutput(this, "HttpApi URL", {
      value: httpApi.url ?? "Error: can't get the HTTP API URL!",
    });
    new CfnOutput(this, "UserPool Id", {
      value: userPool.userPoolId ?? "Error: can't get the user pool id!",
    });
    new CfnOutput(this, "UserPoolClient Id", {
      value: userPoolClient.userPoolClientId ?? "Error: can't get the user pool client id!",
    });
  }
}
