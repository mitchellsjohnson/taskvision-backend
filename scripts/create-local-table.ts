import { DynamoDBClient, CreateTableCommand, ResourceInUseException } from "@aws-sdk/client-dynamodb";

// Local DynamoDB configuration
const client = new DynamoDBClient({ 
  region: "us-east-1",
  endpoint: "http://localhost:8000",
  credentials: {
    accessKeyId: "fakeMyKeyId",
    secretAccessKey: "fakeSecretAccessKey"
  }
});

const createTable = async () => {
  const command = new CreateTableCommand({
    TableName: "taskvision-local",
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
    console.log("Local table created successfully:", response);
    console.log("Table name: taskvision-local");
    console.log("You can view it at: http://localhost:8001 (DynamoDB Admin)");
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