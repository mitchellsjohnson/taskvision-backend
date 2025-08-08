const { DynamoDBClient, CreateTableCommand, ListTablesCommand } = require("@aws-sdk/client-dynamodb");

// Simple local DynamoDB client
const client = new DynamoDBClient({
  region: "us-east-1",
  endpoint: "http://localhost:8000",
  credentials: {
    accessKeyId: "fakeKey",
    secretAccessKey: "fakeSecret"
  }
});

async function createTable() {
  try {
    console.log("🔍 Checking existing tables...");
    
    // First, list existing tables
    const listCommand = new ListTablesCommand({});
    const listResult = await client.send(listCommand);
    console.log("📋 Existing tables:", listResult.TableNames);
    
    const tableName = "TaskVision";
    
    if (listResult.TableNames && listResult.TableNames.includes(tableName)) {
      console.log(`✅ Table '${tableName}' already exists!`);
      return;
    }
    
    console.log(`🚀 Creating table '${tableName}'...`);
    
    const createCommand = new CreateTableCommand({
      TableName: tableName,
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

    const result = await client.send(createCommand);
    console.log("✅ Table created successfully!");
    console.log("📊 Table status:", result.TableDescription.TableStatus);
    console.log("🌐 You can view it at: http://localhost:8001");
    
  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.name === 'ResourceInUseException') {
      console.log("✅ Table already exists!");
    }
  }
}

createTable();