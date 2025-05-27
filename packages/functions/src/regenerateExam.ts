import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { APIGatewayProxyEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = new BedrockRuntimeClient({ region: "us-east-1" });

const modelId = "anthropic.claude-instant-v1";

const dbClient = new DynamoDBClient({});

const dynamo = DynamoDBDocumentClient.from(dbClient);

export async function regenerate(event: APIGatewayProxyEvent) {
  const tableName = "bank-moe-questions-bank-Exams"
  let data;

  //Handle empty body
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
  const feedback = data.feedback;



  try {
    const prompt = `
    📚 As a school exam generator AI, your job is to update specific parts of an exam based on the user's feedback.
    
    ✏️ Modify only the parts explicitly mentioned in the feedback. Do NOT change anything else.
    
    ---
    
    🗣️ Feedback from the user:
    ${JSON.stringify(feedback, null, 2)}
    
    ---
    
    📝 Original Exam Content:
    ${JSON.stringify(exam, null, 2)}
    
    ---
    
    ⚠️ Instructions:
    - Respond ONLY with the modified exam as a valid JSON object.
    - Do not include any explanations or formatting.
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

    // Extract and print the response text.
    const responseText = response.output.message.content[0].text;


    await dynamo.send(
      new UpdateCommand({
        TableName: tableName,
        Key: {
          examID: examID, // Primary key to find the item
        },
        UpdateExpression: "SET examContent = :examContent, contributors = :contributors", // Update only examState
        ExpressionAttributeValues: {
          ":examContent": responseText,
          ":contributors": contributors,    // New value for examState
        },
      })
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newExamContent: responseText,
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
