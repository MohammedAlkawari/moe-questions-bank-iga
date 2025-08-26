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
  const { examID, feedback, contributors, sectionIndexes } = data;

  if (
    !examID ||
    !Array.isArray(sectionIndexes) ||
    sectionIndexes.length === 0 ||
    !Array.isArray(feedback) ||
    feedback.length === 0
  ) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: true,
        message:
          "examID, sectionIndexes, and feedback are required and must be non-empty arrays.",
      }),
    };
  }

  try {
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

    const fullExam =
      typeof Item.examContent === "string"
        ? JSON.parse(Item.examContent)
        : Item.examContent;

    for (const index of sectionIndexes) {
      const sectionFeedback = feedback.find(
        (f: any) => f.section === `section-${index}`
      );
      if (!sectionFeedback) {
        console.warn(`No feedback found for section index ${index}. Skipping.`);
        continue;
      }

      if (!fullExam.sections || !fullExam.sections[index]) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: true,
            message: `Invalid section index: ${index}`,
          }),
        };
      }

      const targetSection = fullExam.sections[index];

      const prompt = `
        You are an AI exam editor. Apply the user's description to the following section only.

        💡 Section to be modified (JSON):
        ${JSON.stringify(targetSection, null, 2)}

        📝 User's description and instructions:
        ${JSON.stringify(sectionFeedback.feedback)}

        Instructions:
        - Apply the description(feedback) precisely to this section.
        - Do NOT modify any other part of the exam.
        - Return ONLY the updated section object (valid JSON).
      `;

      const command = new ConverseCommand({
        modelId,
        messages: [{ role: "user", content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens: 8000, temperature: 0.5, topP: 0.9 },
      });

      const response = await client.send(command);
      const responseText = response.output?.message?.content?.[0]?.text ?? "";

      let updatedSection;
      try {
        const jsonStartIndex = responseText.indexOf('{');
        const jsonEndIndex = responseText.lastIndexOf('}');
        if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
            const jsonString = responseText.substring(jsonStartIndex, jsonEndIndex + 1);
            updatedSection = JSON.parse(jsonString);
        } else {
            throw new Error("No JSON object found in model response");
        }
      } catch (err) {
        console.error("❌ Invalid JSON from model:", responseText);
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: true,
            message: "Model response is not valid JSON",
            responseText: responseText,
          }),
        };
      }

      fullExam.sections[index] = updatedSection;
    }

    await dynamo.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { examID },
        UpdateExpression:
          "SET examContent = :examContent, contributors = :contributors",
        ExpressionAttributeValues: {
          ":examContent": JSON.stringify(fullExam),
          ":contributors": contributors || Item.contributors,
        },
      })
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updatedExamContent: fullExam }),
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
