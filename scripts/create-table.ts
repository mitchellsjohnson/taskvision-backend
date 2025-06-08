import { DynamoDBClient, CreateTableCommand, ResourceInUseException } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ 
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ""
  }
});

const createTable = async () => {
  const command = new CreateTableCommand({
    TableName: "taskvision-prod",
    AttributeDefinitions: [
      { AttributeName: "PK", AttributeType: "S" },
      { AttributeName: "SK", AttributeType: "S" },
      { AttributeName: "GSI1PK", AttributeType: "S" },
      { AttributeName: "GSI1SK", AttributeType: "S" }
    ],
    KeySchema: [
      { AttributeName: "PK", KeyType: "HASH" },
      { AttributeName: "SK", KeyType: "RANGE" }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "GSI1",
        KeySchema: [
          { AttributeName: "GSI1PK", KeyType: "HASH" },
          { AttributeName: "GSI1SK", KeyType: "RANGE" }
        ],
        Projection: {
          ProjectionType: "ALL"
        }
      }
    ],
    BillingMode: "PAY_PER_REQUEST"
  });

  try {
    const response = await client.send(command);
    console.log("Table created successfully:", response);
  } catch (error) {
    if (error instanceof ResourceInUseException) {
      console.log("Table already exists");
    } else {
      console.error("Error creating table:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error name:", error.name);
      }
    }
  }
};

createTable(); 