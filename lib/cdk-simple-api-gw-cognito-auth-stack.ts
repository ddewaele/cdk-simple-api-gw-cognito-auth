import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { CfnUserPoolGroup, OAuthScope, ResourceServerScope, UserPool, UserPoolClient, UserPoolResourceServer, VerificationEmailStyle } from 'aws-cdk-lib/aws-cognito';

import * as path from 'path';
import { execSync } from 'child_process';
import { Duration } from 'aws-cdk-lib';

export class CdkSimpleApiGwCognitoAuthStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


    const userPool = new UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      userVerification: {
        emailSubject: 'Verify your email for our awesome app!',
        emailBody: 'Thanks for signing up to our awesome app! Your verification code is {####}',
        emailStyle: VerificationEmailStyle.CODE,
      },
      signInAliases: {
        email: true,
      },
    });

    const domain = userPool.addDomain('CognitoDomain', {
      cognitoDomain: {
        domainPrefix: "simple-api-gw-cog-auth-domain",
      },
    });

    const authCodeClientNoSecret = userPool.addClient('AuthCodeClientNoSecret', {
      generateSecret: false,
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE]
      },
    });

    const authCodeClientSecret = userPool.addClient('AuthCodeClientSecret', {
      generateSecret: true,
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE, OAuthScope.custom('test-resource-server1/user')],
        callbackUrls: ['https://davydewaele.bubbleapps.io/api/1.1/oauth_redirect'],
      },
    });


    // Define a resource server with custom scopes
    const resourceServer = new UserPoolResourceServer(this, 'ResourceServer', {
      identifier: 'test-resource-server1',
      userPool,
      scopes: [
        new ResourceServerScope({
          scopeName: 'admin',
          scopeDescription: 'Admin scope',
        }),
        new ResourceServerScope({
          scopeName: 'employee',
          scopeDescription: 'Employee scope',
        }),
        new ResourceServerScope({
          scopeName: 'user',
          scopeDescription: 'User scope',
        }),
      ],
    });

    // Create an App Client for Client Credentials Flow
    const clientCredentialsClient = userPool.addClient('ClientCredentialsClient', {
      generateSecret: true, // Client secret is needed
      oAuth: {
        flows: {
          clientCredentials: true,
        },
        scopes: [
          OAuthScope.resourceServer(resourceServer, { scopeName: "admin", scopeDescription: "admin" }),
          OAuthScope.resourceServer(resourceServer, { scopeName: "employee", scopeDescription: "employee" }),
          OAuthScope.resourceServer(resourceServer, { scopeName: "user", scopeDescription: "user" }),
        ],
      },
    });

    //const lambdaPath = path.resolve(__dirname, '../lambda/nestjs');
    const lambdaPath = path.resolve(__dirname, '../lambda/simple-lambda');

    // Define the Lambda function
    const simpleLambda = new lambda.Function(this, 'simpleLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler', // Assumes your Lambda code is in index.js
      code: lambda.Code.fromAsset(lambdaPath), // Path to your Lambda function code
    });

    // Define a Cognito authorizer for the API Gateway
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
    });

    const nestJsApiLambdaIntegration = new apigateway.LambdaIntegration(simpleLambda);

    const restApi = new apigateway.RestApi(this, 'SimpleRestApi', {
      restApiName: 'Simple REST API'
    });

    //Add a resource with an ANY method
    restApi.root.addMethod('ANY', nestJsApiLambdaIntegration, { authorizer, authorizationType: apigateway.AuthorizationType.COGNITO });

    restApi.root.addResource('idToken', {
      defaultIntegration:nestJsApiLambdaIntegration,
      defaultMethodOptions: {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    }).addMethod('GET');

    restApi.root.addResource('accessToken', {
      defaultIntegration:nestJsApiLambdaIntegration,
      defaultMethodOptions: {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizationScopes: ['test-resource-server1/user']
      }
    }).addMethod('GET');

      restApi.root.addResource('unsecure', {defaultIntegration:nestJsApiLambdaIntegration}).addMethod('GET');


  }

}
