import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { APIGatewayProxyEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";

const client = new BedrockRuntimeClient({ region: "us-east-1" });
const modelId = "anthropic.claude-3-5-sonnet-20240620-v1:0";

const dbClient = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(dbClient);

export async function regenerate(event: APIGatewayProxyEvent) {
  const tableName = "bank-moe-questions-bank-Exams";

  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: true, message: "Missing body" }),
    };
  }

  const data = JSON.parse(event.body);
  const examID = data.examID;
  const exam = data.examContent;
  const contributors = data.contributors;
  const description = data.description;
  const sectionIndexes = data.sectionIndexes;

  console.log("📦 examID:", examID);
  console.log("📦 examContent:", JSON.stringify(exam, null, 2));
  console.log("📦 description:", JSON.stringify(description, null, 2));
  console.log("📦 contributors:", contributors);
  
  if (!examID || sectionIndexes === undefined || !description) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: true,
        message: "examID, sectionIndexes, and description are required",
      }),
    };
  }

  try {
    // ✅ 1. Fetch full exam from DynamoDB
    const { Item } = await dynamo.send(
      new GetCommand({
        TableName: tableName,
        Key: { examID },
      })
    );

    if (!Item || !Item.examContent) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: true, message: "Exam not found" }),
      };
    }

    const exam = typeof Item.examContent === "string"
      ? JSON.parse(Item.examContent)
      : Item.examContent;

    if (!exam.sections || !exam.sections[sectionIndexes]) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: true,
          message: `Invalid sectionIndexes: ${sectionIndexes}`,
        }),
      };
    }

    const targetSection = exam.sections[sectionIndexes];

    // ✅ 2. Build prompt only for that section
    const prompt = `
    You are an AI exam editor. Apply the user's description to the following section only.

    💡 Section to be modified (JSON):
    ${JSON.stringify(targetSection, null, 2)}

    📝 User's description and instructions:
    ${JSON.stringify(description)}

    Instructions:
    - Apply the description(feedback) precisely to this section.
    - Do NOT modify any other part of the exam.
    - Return ONLY the updated section object (valid JSON).
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
      inferenceConfig: { maxTokens: 800, temperature: 0.5, topP: 0.9 },
    });

    const response = await client.send(command);

    const responseText =
      (response.output?.message?.content ?? [])
        .map((c: any) => c?.text)
        .find((t: string) => typeof t === "string" && t.trim().length > 0) ?? "";

    // ✅ 3. Parse model output
    let updatedSection;
    try {
      updatedSection = JSON.parse(responseText);
    } catch (err) {
      console.error("❌ Invalid JSON from model:", responseText);
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: true,
          message: "Model response is not valid JSON",
        }),
      };
    }

    // ✅ 4. Replace section in exam
    exam.sections[sectionIndexes ] = updatedSection;

    // ✅ 5. Save back to DynamoDB
    await dynamo.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { examID },
        UpdateExpression:
          "SET examContent = :examContent, contributors = :contributors",
        ExpressionAttributeValues: {
          ":examContent": JSON.stringify(exam),
          ":contributors": contributors || [],
        },
      })
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updatedExamContent: exam,
      }),
    };
  } catch (error: any) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Error regenerating section: " + error.message,
      }),
    };
  }
}
