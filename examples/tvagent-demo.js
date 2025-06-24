/**
 * TVAgent Demo Script
 * 
 * This script demonstrates how to interact with the TVAgent endpoint.
 * Note: This is a demo script and requires proper authentication tokens in production.
 */

const examples = [
  {
    name: "Create a simple task",
    message: "Create a task called 'Review quarterly reports'",
    expectedFunction: "create_task"
  },
  {
    name: "Create a high priority task with due date",
    message: "Add a high priority task to call client about project status, due tomorrow",
    expectedFunction: "create_task"
  },
  {
    name: "Create a MIT task",
    message: "Make an important task for preparing presentation due next Friday",
    expectedFunction: "create_task"
  },
  {
    name: "Update task status",
    message: "Mark task ABC123 as completed",
    expectedFunction: "update_task"
  },
  {
    name: "Change task due date",
    message: "Move the due date of task XYZ789 to next Monday",
    expectedFunction: "update_task"
  },
  {
    name: "Delete a task",
    message: "Delete task DEF456",
    expectedFunction: "delete_task"
  },
  {
    name: "Get open tasks",
    message: "Show me my open tasks",
    expectedFunction: "get_tasks"
  },
  {
    name: "Search tasks",
    message: "Find all tasks about presentations",
    expectedFunction: "get_tasks"
  },
  {
    name: "Get urgent tasks",
    message: "List all high priority tasks due this week",
    expectedFunction: "get_tasks"
  }
];

async function demoTVAgent() {
  console.log("🤖 TVAgent Demo - Natural Language Task Management");
  console.log("=" .repeat(60));
  
  for (const example of examples) {
    console.log(`\n📝 ${example.name}`);
    console.log(`Input: "${example.message}"`);
    console.log(`Expected Function: ${example.expectedFunction}`);
    
    try {
      // In a real implementation, you would make an HTTP request like this:
      /*
      const response = await fetch('/api/tvagent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer YOUR_JWT_TOKEN'
        },
        body: JSON.stringify({ message: example.message })
      });
      
      const result = await response.json();
      console.log(`✅ Response: ${result.message}`);
      if (result.data) {
        console.log(`📊 Data:`, JSON.stringify(result.data, null, 2));
      }
      */
      
      // For demo purposes, we'll simulate the expected response
      console.log(`✅ [SIMULATED] Function called: ${example.expectedFunction}`);
      console.log(`✅ [SIMULATED] Response: Task operation completed successfully`);
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
    
    console.log("-".repeat(50));
  }
}

// Example curl commands for testing
const curlExamples = `
🔧 Testing with curl:

# Create a task
curl -X POST http://localhost:6060/api/tvagent \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -d '{"message": "Create a task called Review quarterly reports due next Friday"}'

# Update a task
curl -X POST http://localhost:6060/api/tvagent \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -d '{"message": "Mark task ABC123 as completed"}'

# Get tasks
curl -X POST http://localhost:6060/api/tvagent \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -d '{"message": "Show me my open tasks"}'
`;

if (require.main === module) {
  console.log(curlExamples);
  demoTVAgent().catch(console.error);
}

module.exports = { examples, demoTVAgent }; 