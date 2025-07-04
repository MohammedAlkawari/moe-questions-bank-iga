import { Api, Bucket, StackContext, Topic, use } from "sst/constructs";
import { CacheHeaderBehavior, CachePolicy } from "aws-cdk-lib/aws-cloudfront";
import { Duration } from "aws-cdk-lib/core";
import { DBStack } from "./DBStack"
import { StorageStack } from "./StorageStack";
import s3 from "aws-cdk-lib/aws-s3";
import { MyStack } from "./OpenSearchStack"; // Import the OpenSearch stack
import { FunctionsStack } from "./FunctionsStack";



export function ApiStack({ stack }: StackContext) {
  const { collectionEndpoint } = use(MyStack); // Retrieve the OpenSearch endpoint
  const { examQueue } = use(FunctionsStack);

  const topic = new Topic(stack, "Report");
  const userTopic = new Topic(stack, "UserTopic");

  const { users_table, exams_table, exams_dataset, examRequestsTable  } = use(DBStack); //examRequestsTable added by ma
  const { materialsBucket } = use(StorageStack);

  //const bucket = new Bucket(stack, "Audio");
  const bucket = new Bucket(stack, "Audio", {
    cdk: {
      bucket: new s3.Bucket(stack, "AudioBucket", {
        encryption: s3.BucketEncryption.S3_MANAGED,
        publicReadAccess: false,
    })
    }
  })

  // Create the HTTP API
  const api = new Api(stack, "Api", {
    defaults: {
      authorizer: "none",
      payloadFormatVersion: "2.0", //Added by MohamedAli
    },
    routes: {
      "GET /examForm/{id}": {
        function: {
          handler: "packages/functions/src/getExam.getExamData",
          runtime: "nodejs20.x",
          timeout: 180,
          permissions: ["dynamodb", exams_table],
          environment: {
            TABLE_NAME: exams_table.tableName,
          },
        },
      },

      "GET /getExamHistory": {
        function: {
          handler: "packages/functions/src/getExamHistory.getExams",
          runtime: "nodejs20.x",
          timeout: 180,
          permissions: ["dynamodb", exams_table], // Ensure necessary permissions
          environment: {
            TABLE_NAME: exams_table.tableName, // Pass the table name to the Lambda
          },
        },
      },

      "GET /uploadFiles": {
        function: {
          handler: "packages/functions/src/getSignedUrl.getUploadLink",
          runtime: "nodejs20.x",
          timeout: 180,
          permissions: ["s3", materialsBucket],
          environment: {
            BUCKET_NAME: materialsBucket.bucketName,
          },
        },
      },

      "GET /getExamCount": {
        function: {
          handler: "packages/functions/src/getExamsCount.getExamsCount",
          runtime: "nodejs20.x",
          timeout: 180,
          permissions: ["dynamodb", exams_table], // Ensure necessary permissions
          environment: {
            TABLE_NAME: exams_table.tableName, // Pass the table name to the Lambda
          },
        },
      },

      "GET /getBuildingExams": {
        function: {
          handler: "packages/functions/src/getBuildingExams.getExams",
          runtime: "nodejs20.x",
          timeout: 180,
          permissions: ["dynamodb", exams_table],
          environment: {
            TABLE_NAME: exams_table.tableName,
          },
        },
      },

      "GET /getPendingExams": {
        function: {
          handler: "packages/functions/src/getPendingExams.getExams",
          runtime: "nodejs20.x",
          timeout: 180,
          permissions: ["dynamodb", exams_table],
          environment: {
            TABLE_NAME: exams_table.tableName,
          },
        },
      },

      "POST /regenerate": {
        function: {
          handler: "packages/functions/src/regenerateExam.regenerate",
          runtime: "nodejs20.x",
          timeout: 180,
          permissions: ["bedrock", "dynamodb", exams_table],
          environment: {
            TABLE_NAME: "bank-moe-questions-bank-Exams",
          },
        },
      },

      "POST /createNewExam": {
        function: {
          handler: "packages/functions/src/createNewExam.createExam",
          runtime: "nodejs20.x",
          timeout: 180,
          permissions: ["dynamodb", exams_table, "bedrock"],
          environment: {
            TABLE_NAME: exams_table.tableName,
            KNOWLEDGE_BASE_ID: "WCTC0NYEAV",
          },
        },
      },

      "POST /queueExam": {
        function: {
          handler: "packages/functions/src/producer.handler",
          runtime: "nodejs20.x",
          timeout: 60,
          permissions: ["sqs"],
          environment: {
            QUEUE_URL: examQueue.queueUrl,
          },
        },
      },


      "POST /sendForApproval": {
        function: {
          handler: "packages/functions/src/sendExamForApproval.sendForApproval",
          runtime: "nodejs20.x",
          timeout: "180 seconds",
          permissions: ["dynamodb", exams_table,"sns"],
          environment: {
            TABLE_NAME: exams_table.tableName,
            TOPIC_ARN: userTopic.topicArn,
          },
        },
      },

      "POST /changeExamToBuild": {
        function: {
          handler:
            "packages/functions/src/changeExamStateToBuild.changeToBuild",
          runtime: "nodejs20.x",
          timeout: 180,
          permissions: ["dynamodb", exams_table],
          environment: {
            TABLE_NAME: exams_table.tableName,
          },
        },
      },

      "POST /approveExam": {
        function: {
          handler: "packages/functions/src/approveExam.approve",
          runtime: "nodejs20.x",
          timeout: "180 seconds",
          permissions: ["dynamodb", exams_table, exams_dataset,"polly","s3","bedrock","sns"],
          environment: {
            TABLE_NAME: exams_table.tableName,
            BUCKET_NAME: bucket.bucketName,
            TOPIC_ARN: userTopic.topicArn,
            DATASET_TABLE_NAME:exams_dataset.tableName
          },
        },
      },

      "POST /disapproveExam": {
        function: {
          handler: "packages/functions/src/disapproveExam.disapprove",
          runtime: "nodejs20.x",
          timeout: "180 seconds",
          permissions: ["dynamodb", exams_table, exams_dataset, "sns"],
          environment: {
            TABLE_NAME: exams_table.tableName,
            TOPIC_ARN: userTopic.topicArn,
            DATASET_TABLE_NAME:exams_dataset.tableName
          },
        },
      },

      "POST /feedback": {
        function: {
          handler: "packages/functions/src/feedback.handler",
          runtime: "nodejs20.x",
          timeout: 180,
          environment: {
            TOPIC_ARN: topic.topicArn, // Add the ARN to the environment
          },
          permissions: ["sns"],
        },
      },

      "POST /checkUserRole": {
        function: {
          handler: "packages/functions/src/checkUser.handler",
          runtime: "nodejs20.x",
          timeout: 180,
          permissions: ["dynamodb", users_table],
          environment: {
            TABLE_NAME: users_table.tableName,
          },
        },
      },    

      "POST /create-index": {
      function: {
        handler: "packages/functions/src/create-index.handler",
        runtime: "nodejs20.x",
        timeout: "60 seconds",
        environment: {
          OPENSEARCH_ENDPOINT: collectionEndpoint, // Use the dynamic endpoint
        },
        permissions: [
          "aoss:CreateIndex", 
          "aoss:DescribeIndex", 
          "aoss:ListIndices",  // Optional: If you want to list indices
          ],
        },
      },

      "POST /convertToAudio": {
        function: {
          handler: "packages/functions/src/generateAudio.handler",
          runtime: "nodejs20.x",
          timeout: "180 seconds",
          permissions: ["polly"],
        },
      },
      "POST /getAudio": {
        function: {
          handler: "packages/functions/src/getAudio.handler",
          runtime: "nodejs20.x",
          timeout: "180 seconds",
          permissions: ["s3"],
          environment: {
            BUCKET_NAME: bucket.bucketName,
          },
        },
      },

        //Added by ma
       "POST /requestExam": {
          function: {
            handler: "packages/functions/src/requestExam.main",
            permissions: [examRequestsTable], // ← تأكد تضيف الجدول هنا
            environment: {
              TABLE_NAME: examRequestsTable.tableName,
          },
        },
      },

         
        "GET /checkExamStatus/{id}": {
          function: {
            handler: "packages/functions/src/checkExamStatus.main",
            permissions: [examRequestsTable],
            environment: {
              TABLE_NAME: examRequestsTable.tableName,
            },
          },
        },
      },
  });


  // cache policy to use with cloudfront as reverse proxy to avoid cors
  // https://dev.to/larswww/real-world-serverless-part-3-cloudfront-reverse-proxy-no-cors-cgj
  const apiCachePolicy = new CachePolicy(stack, "CachePolicy", {
    minTtl: Duration.seconds(60), // no cache by default unless backend decides otherwise
    defaultTtl: Duration.seconds(360),
    headerBehavior: CacheHeaderBehavior.allowList(
      "Accept",
      "Authorization",
      "Content-Type",
      "Referer",
      "Origin"
    ),
  });

  return { api, apiCachePolicy };
}
