/**
 * Create Local DynamoDB Table with GSI1 and GSI2
 *
 * This script creates the TaskVision table in local DynamoDB (Docker)
 * with all indexes needed for SMS feature.
 */

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
    TableName: "TaskVision",
    AttributeDefinitions: [
      { AttributeName: "PK", AttributeType: "S" },
      { AttributeName: "SK", AttributeType: "S" },
      { AttributeName: "GSI1PK", AttributeType: "S" },
      { AttributeName: "GSI1SK", AttributeType: "S" },
      { AttributeName: "GSI2PK", AttributeType: "S" }  // NEW: For phone number lookup
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
      },
      {
        IndexName: "GSI2",  // NEW: For reverse phone number lookup
        KeySchema: [
          { AttributeName: "GSI2PK", KeyType: "HASH" }
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
    console.log("✓ Local table created successfully");
    console.log("");
    console.log("Table Details:");
    console.log("  Name: TaskVision");
    console.log("  Indexes:");
    console.log("    - GSI1: Task short code lookups (SHORTCODE#a1b2)");
    console.log("    - GSI2: Phone number lookups (PHONE#+15551234567)");
    console.log("");
    console.log("View at: http://localhost:8001 (DynamoDB Admin)");
    console.log("");
    console.log("Next steps:");
    console.log("  1. Start backend: npm start");
    console.log("  2. Test SMS APIs: curl http://localhost:6060/api/user/sms-settings");
  } catch (error) {
    if (error instanceof ResourceInUseException) {
      console.log("✓ Table already exists");
      console.log("");
      console.log("To recreate table:");
      console.log("  1. Delete table in DynamoDB Admin (http://localhost:8001)");
      console.log("  2. Run this script again");
    } else {
      console.error("✗ Error creating table:", error);
      if (error instanceof Error) {
        console.error("  Message:", error.message);
        console.error("  Name:", error.name);
      }
      process.exit(1);
    }
  }
};

console.log("=== Creating Local DynamoDB Table ===");
console.log("");
createTable();
