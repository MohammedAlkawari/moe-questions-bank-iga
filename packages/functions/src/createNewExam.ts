import {
  DynamoDBClient
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";
import { ENG102PROMPT } from "./prompts/Eng102";
import { ARAB101PROMPT } from "./prompts/Arab101";


const client = new DynamoDBClient({
  region: "us-east-1",
  maxAttempts: 5,
});

const dynamo = DynamoDBDocumentClient.from(client);

const bedrockClient = new BedrockRuntimeClient({ region: "us-east-1" });

const modelId = "anthropic.claude-3-5-sonnet-20240620-v1:0";

export async function createExam(event) {
  console.log("📩 createExam triggered", JSON.stringify(event));
  if (!client || !dynamo) { 
    console.log("Error with DynamoDB client");
  }
  const tableName = process.env.TABLE_NAME;
  const knowledgeBaseId = process.env.KNOWLEDGE_BASE_ID;
  console.log("Table Name:", process.env.TABLE_NAME);

  // Handle empty body
  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Request body is missing" }),
    };
  }

  let data = JSON.parse(event.body);
  console.log(data)

  let body;
  let statusCode = 200;
  const headers = {
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
  };

  let prompt = "";

  // Handle regeneration or creation
  if (data.examID) {
    // Regenerate an existing exam with specific updates
    try {
      const result = await dynamo.send(
        new GetCommand({
          TableName: tableName,
          Key: { examID: data.examID },
        })
      );

      if (!result.Item) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: "Exam not found" }),
        };
      }

      let existingExam;
     
      //existingExam = JSON.parse(result.Item.examContent);
      existingExam = typeof result.Item.examContent === "string"
      ? JSON.parse(result.Item.examContent)
      : result.Item.examContent;

     
      const cleanedFeedback = data.feedback.map(item => ({
        section: item.section,
        feedback: typeof item.feedback === 'string' ? item.feedback : JSON.stringify(item.feedback)
      }));

      

       // Build prompt to update exam content
      if (data.feedback) {
          prompt = `
          Update the following exam based on the feedback provided.
          Ensure that all related information is recalculated to maintain consistency.

          Feedback: ${JSON.stringify(cleanedFeedback, null , 2)}
          
          Current Exam Content:
          ${JSON.stringify(existingExam, null, 2)}
          
          The type of your response must be a JSON object containing the updated exam only. Ensure all changes are reflected accurately
          `;
        
        console.log("Prompt for Regeneration with Feedback:", prompt);
      } else {
        //for normal regenerating without feedback
        prompt = `
        Regenerate the following exam to improve its structure, variety, and balance. 
        Maintain the original structure and question count unless specified otherwise.

        Current Exam Content:
        ${JSON.stringify(existingExam, null, 2)}

        The type of your response must be a JSON object containing the updated exam only.
        `;
      }

      console.log("Prompt for Regeneration:", prompt);

      const conversation = [
        {
          role: "user",
          content: [{ text: prompt }],
        },
      ];

      const command = new ConverseCommand({
        modelId,
        //@ts-ignore
        messages: conversation,
        inferenceConfig: { maxTokens: 4096, temperature: 0.5, topP: 0.9 },
      });

      const response = await bedrockClient.send(command);

      //@ts-ignore
      //const responseText = response.output.message.content[0].text;
      //console.log("Updated Exam Content:", responseText);
      const fullText = response.output.message.content[0].text;
      
      // حدد أول `{` وآخر `}`
      const jsonStart = fullText.indexOf('{');
      const jsonEnd = fullText.lastIndexOf('}');
      
      if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
        throw new Error("❌ Failed to extract JSON: Missing or invalid braces");
      }
      
      // استخرج النص بين الأقواس
     /* const cleanedJson = fullText.slice(jsonStart, jsonEnd + 1).trim();
      
      let parsed;
      try {
        parsed = JSON.parse(cleanedJson);
      } catch (err) {
        console.error("❌ Invalid JSON returned from model:", cleanedJson);
        throw new Error("Returned content is not valid JSON. Model response: " + cleanedJson);
      }
      */
      const cleanedJson = fullText.slice(jsonStart, jsonEnd + 1).trim();

      // تحقق إضافي قبل JSON.parse
      if (
        cleanedJson.includes("[object Object]") ||
        !cleanedJson.startsWith("{") ||
        !cleanedJson.endsWith("}")
      ) {
        console.error("❌ Model response is not valid JSON:", cleanedJson);
        throw new Error("Model response is not valid JSON: " + cleanedJson);
      }
      
      let parsed;
      try {
        parsed = JSON.parse(cleanedJson);
      } catch (err) {
        console.error("❌ Invalid JSON returned from model:", cleanedJson);
        throw new Error("Returned content is not valid JSON. Model response: " + cleanedJson);
      }


      await dynamo.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { examID: data.examID },
          UpdateExpression:
            "SET examContent = :examContent, numOfRegenerations = if_not_exists(numOfRegenerations, :zero) + :incr, contributors = :contributors",
            
          ExpressionAttributeValues: {
            ":examContent": parsed,
            ":incr": 1,
            ":zero": 0,
            ":contributors": data.contributors,
          },
        })
      );
    console.log("Prompt built");

    //const response = await bedrockClient.send(command);

      body = { message: "Exam successfully regenerated", updatedExamContent: cleanedJson };
    } catch (error) {
      console.error("Error regenerating exam:", error);
      statusCode = 500;
      body = { error: "Failed to regenerate exam", details: error.message };
       console.log("🔥 Error Stack:", error.stack); 
    }

  } else {
    // Create a new exam
    try {
      if (data.subject === "ARAB101") {
        prompt = ARAB101PROMPT;
      } else {
        const bedrockAgentClient = new BedrockAgentRuntimeClient({
          region: "us-east-1",
        });
        let retrieveCommand = new RetrieveCommand({
           knowledgeBaseId: knowledgeBaseId ?? "WCTC0NYEAV", //Add ur KB ID...
          retrievalConfiguration: {
            vectorSearchConfiguration: {
              numberOfResults: 10,
            },
          },
          retrievalQuery: {
            text: `${data.class} ${data.subject} questions`,
          },
        });

        if (!data.customize) {
          const relevant_info = (
            await bedrockAgentClient.send(retrieveCommand)
          ).retrievalResults
            ?.map((e) => e.content?.text)
            .join("\n")
            .toString();
          prompt =
            ENG102PROMPT +
            " Refer to the following relevant information from past exams:" +
            relevant_info;
        }
      }
      

      const conversation = [
        {
          role: "user",
          content: [{ text: prompt }],
        },
      ];

      const command = new ConverseCommand({
        modelId,
        //@ts-ignore
        messages: conversation,
        inferenceConfig: { maxTokens: 4096, temperature: 0.5, topP: 0.9 },
      });

    console.log("Prompt built");

    let cleanedJson = "";
    
    try {
      const response = await bedrockClient.send(command);
      
      const content = response?.output?.message?.content;
      
      if (!content || !content[0]?.text) {
        throw new Error("Invalid response from Bedrock model – missing content");
      }
    
      cleanedJson = content[0].text;
    
      console.log("Response from Bedrock:", cleanedJson);
    } catch (error) {
      console.error("Bedrock model error:", error);
      statusCode = 500;
      body = { error: "Failed to generate exam content", details: error.message || "Unknown error" };
      return {
        statusCode,
        headers,
        body: JSON.stringify(body)
      };
    }


    console.log("Model done");
    //@ts-ignore
    console.log("cleanedJson size:", Buffer.byteLength(cleanedJson, "utf-8"));
    console.log("🧠 Item size in bytes:", Buffer.byteLength(JSON.stringify));


      const uuid = uuidv4()
      await dynamo.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            examID: uuid,
            examState: "building",
            examClass: data.class,
            examSubject: data.subject,
            examSemester: data.semester,
            examDuration: data.duration,
            examMark: data.total_mark,
            examContent: typeof cleanedJson === "string" ? cleanedJson : JSON.stringify(cleanedJson),
            createdBy: data.created_by,
            creationDate: data.creation_date,
            contributors: data.contributors,
            numOfRegenerations: 0,
          },
        })
      );

      body = {examID: uuid, message: "Exam successfully created"}
    } catch (error) {
      console.error("Error creating exam:", error);
      statusCode = 500;
      body = { error: "Failed to create exam", details: error.message };
    }
  }
  if (!body) {
  statusCode = 500;
  body = { error: "Unexpected server error. No response body." };
}

 return {
  statusCode,
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
  },
  body: JSON.stringify(body),
};
} 
