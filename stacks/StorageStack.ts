import { Bucket, StackContext, Function } from "sst/constructs";

export function StorageStack({ stack }: StackContext) {
  // Create a function to sync the knowledge base
  const syncKnowledgeBase = new Function(stack, "SyncKnowledgeBase", {
    handler: "packages/functions/src/SyncKB.handler",
    permissions: ["bedrock:StartIngestionJob"],
    // Environment variables will be added in the Bedrock stack to avoid a circular dependency
  });

  // Create the S3 bucket and attach the notification
  const materialsBucket = new Bucket(stack, "MaterialsBucket", {
    notifications: {
      sync: syncKnowledgeBase,
    },
  });
    
  // Outputs
  stack.addOutputs({
    BucketName: materialsBucket.bucketName,
  });

  return { materialsBucket, syncKnowledgeBase };
}
