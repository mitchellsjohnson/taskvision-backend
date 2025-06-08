import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const isOffline = process.env.IS_OFFLINE === "true";

let docClient: DynamoDBDocumentClient;

const getClient = () => {
  if (docClient) {
    return docClient;
  }

  let client: DynamoDBClient;

  if (isOffline) {
    if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error("Missing AWS credentials for local DynamoDB. Please check your .env.local file.");
    }
    
    client = new DynamoDBClient({
      region: process.env.AWS_REGION,
      endpoint: "http://localhost:8000",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  } else {
    // Production configuration
    client = new DynamoDBClient({});
  }

  docClient = DynamoDBDocumentClient.from(client);
  return docClient;
};

export default getClient(); 