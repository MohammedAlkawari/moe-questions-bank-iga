import { StackContext, use, Stack } from "sst/constructs";
import { BedrockKnowledgeBase } from "bedrock-agents-cdk";
import * as iam from "aws-cdk-lib/aws-iam";
import { MyStack } from "./OpenSearchStack";
import { StorageStack } from "./StorageStack";

export function BedrockKbLambdaStack({ stack }: StackContext) {
  const { materialsBucket, syncKnowledgeBase } = use(StorageStack);
  const { collectionArn, customResource } = use(MyStack);

  if (!customResource) {
    throw new Error("Custom Resource not found");
  }

  const s3BucketArn = materialsBucket.bucketArn;
 
  const bedrockKbRole = new iam.Role(stack, "bedrock-kb-role", {
    roleName: `AmazonBedrockExecutionRoleForKnowledgeBase_bkb-${stack.stage}`,
    description: "IAM role to create a Bedrock Knowledge Base",
    assumedBy: new iam.ServicePrincipal("bedrock.amazonaws.com"),
    managedPolicies: [
      new iam.ManagedPolicy(stack, "bedrock-kb-invoke", {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["bedrock:InvokeModel"],
            resources: [
              "arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v1",
            ],
          }),
        ],
      }),
      new iam.ManagedPolicy(stack, "bedrock-kb-s3-managed-policy", {
        statements: [
          new iam.PolicyStatement({
            sid: "S3ListBucketStatement",
            effect: iam.Effect.ALLOW,
            actions: ["s3:ListBucket"],
            resources: [s3BucketArn],
          }),
          new iam.PolicyStatement({
            sid: "S3GetObjectStatement",
            effect: iam.Effect.ALLOW,
            actions: ["s3:GetObject"],
            resources: [`${s3BucketArn}/*`],
          }),
 
          new iam.PolicyStatement({
            sid: "S3PutObjectStatement",
            effect: iam.Effect.ALLOW,
            actions: ["s3:PutObject"],
            resources: [`${s3BucketArn}/*`],
          }),
        ],
      }),
 
      new iam.ManagedPolicy(stack, "bedrock-kb-opensearch-policy", {
        statements: [
          new iam.PolicyStatement({
            sid: "OpenSearchServerlessAPIAccessAllStatement",
            effect: iam.Effect.ALLOW,
            actions: [
              "aoss:APIAccessAll",
            ],
            resources: [collectionArn],
          }),
        ],
      }),
    ],
  });
 
  const bedrockKb = new BedrockKnowledgeBase(stack, "bedrock-knowledge-base", {
    name: `bedrock-kb-${stack.stage}`,
    roleArn: bedrockKbRole.roleArn,
    storageConfiguration: {
      opensearchServerlessConfiguration: {
        collectionArn: collectionArn,
        vectorIndexName: "embeddings",
        fieldMapping: {
          textField: "textField",
          metadataField: "metadataField",
          vectorField: "vectorField",
        },
      },
      type: "OPENSEARCH_SERVERLESS",
    },
    dataSource: {
      dataSourceConfiguration: {
        s3Configuration: {
          bucketArn: s3BucketArn,
        },
      },
    },
  });

  // Add environment variables to the sync function after the KB is created
  syncKnowledgeBase.addEnvironment("KNOWLEDGE_BASE_ID", bedrockKb.knowledgeBaseId);
  syncKnowledgeBase.addEnvironment("DATA_SOURCE_ID", bedrockKb.dataSourceId);
 
  stack.addOutputs({
    KNOWLEDGE_BASE_ID: bedrockKb.knowledgeBaseId,
    DATA_SOURCE_ID: bedrockKb.dataSourceId,
  });

  return { bedrockKbRole, bedrockKb };
}
