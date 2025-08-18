import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { APIGatewayProxyEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = new BedrockRuntimeClient({ region: "us-east-1" });

const modelId = "anthropic.claude-3-5-sonnet-20240620-v1:0";

const dbClient = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(dbClient);

export async function regenerate(event: APIGatewayProxyEvent) {
  const tableName = "bank-moe-questions-bank-Exams";
  let data;

  if (!event.body) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: true }),
    };
  }

  data = JSON.parse(event.body);
  console.log(event.body);

  const examID = data.examID;
  const exam = data.examContent;
  const contributors = data.contributors;
  const discription = data.description;

  try {
    const prompt = `
      As a school exam generator, you will be given an exam that you will have to change based on the
      user's description. Change only what the user asked for. Return only the newly modified exam as a valid JSON object.
      
      This is the user's description: ${discription}

      This is the exam to modify: 
      ${JSON.stringify(exam)}

      Return ONLY the JSON object. No text explanation.
    `;

    const conversation = [
      {
        role: "user",
        content: [{ text: prompt }],
      },
    ];

    const command = new ConverseCommand({
      modelId,
      messages: conversation,
      inferenceConfig: { maxTokens: 1200, temperature: 0.5, topP: 0.9 },
    });

    const response = await client.send(command);

    const responseText =
      (response.output?.message?.content ?? [])
        .map((c: any) => c?.text)
        .find((t: string) => typeof t === "string" && t.trim().length > 0) ?? "";

    // ✅ Validate that the response is a valid JSON object
    let parsedExamContent;
    try {
      parsedExamContent = JSON.parse(responseText);

      if (
        typeof parsedExamContent !== "object" ||
        !parsedExamContent.sections ||
        !Array.isArray(parsedExamContent.sections)
      ) {
        throw new Error("Invalid exam structure");
      }
    } catch (parseError) {
      console.error("❌ Invalid examContent received from model", responseText);
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: true,
          message: "The model response is not a valid examContent JSON object.",
        }),
      };
    }

    // ✅ Only now update the DynamoDB table
    await dynamo.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { examID },
        UpdateExpression: "SET examContent = :examContent, contributors = :contributors",
        ExpressionAttributeValues: {
          ":examContent": parsedExamContent,
          ":contributors": contributors,
        },
      })
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updatedExamContent: parsedExamContent,
      }),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Error generating question: " + error.message,
      }),
    };
  }
}
