#!/usr/bin/env node

/**
 * Script to create an OpenAI Assistant for TaskVision TVAgent V2
 * 
 * Usage:
 * 1. Set OPENAI_API_KEY environment variable
 * 2. Run: node scripts/create-openai-assistant.js
 */

const OpenAI = require('openai');

async function createAssistant() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    console.log('Set it with: export OPENAI_API_KEY="your_api_key_here"');
    process.exit(1);
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    console.log('🤖 Creating TaskVision AI Assistant...');

    const assistant = await openai.beta.assistants.create({
      name: "TaskVision AI Assistant",
      instructions: `You are TaskVision AI Assistant, a helpful task management assistant. You help users manage their tasks, set priorities, track deadlines, and organize their work.

Key capabilities:
- List and filter tasks by status, priority, or due date
- Create new tasks with titles, descriptions, due dates, and priorities
- Update existing tasks (status, priority, due date)
- Mark tasks as complete or incomplete
- Provide task summaries and insights
- Help with task prioritization and time management

When users ask about tasks, always try to be helpful and provide clear, actionable information. Use the available functions to interact with the TaskVision database.

Be conversational, friendly, and proactive in helping users stay organized and productive.

Task Status Values:
- "Open": New tasks that haven't been started
- "InProgress": Tasks currently being worked on
- "Completed": Finished tasks
- "Waiting": Tasks waiting for external dependencies
- "Canceled": Tasks that were cancelled

Priority Values (1-5 scale):
- 1: Highest priority (urgent/critical)
- 2: High priority (important)
- 3: Medium priority (normal)
- 4: Low priority (nice to have)
- 5: Lowest priority (someday/maybe)`,
      model: "gpt-4o",
      tools: [
        {
          type: "function",
          function: {
            name: "getTasks",
            description: "Get tasks for the user with optional filtering",
            parameters: {
              type: "object",
              properties: {
                status: {
                  type: "array",
                  items: {
                    type: "string",
                    enum: ["Open", "InProgress", "Completed", "Waiting", "Canceled"]
                  },
                  description: "Filter tasks by status (can specify multiple)"
                },
                priority: {
                  type: "number",
                  enum: [1, 2, 3, 4, 5],
                  description: "Filter tasks by priority (1=highest, 5=lowest)"
                },
                search: {
                  type: "string",
                  description: "Search in task titles and descriptions"
                },
                tags: {
                  type: "array",
                  items: {
                    type: "string"
                  },
                  description: "Filter by tags"
                },
                dateFilter: {
                  type: "string",
                  enum: ["pastDue", "dueToday", "dueThisWeek", "dueThisMonth", "noDueDate"],
                  description: "Filter by due date"
                },
                limit: {
                  type: "number",
                  description: "Maximum number of tasks to return"
                }
              }
            }
          }
        },
        {
          type: "function",
          function: {
            name: "createTask",
            description: "Create a new task",
            parameters: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Task title"
                },
                description: {
                  type: "string",
                  description: "Task description"
                },
                dueDate: {
                  type: "string",
                  description: "Due date in ISO format (YYYY-MM-DD)"
                },
                priority: {
                  type: "number",
                  enum: [1, 2, 3, 4, 5],
                  description: "Task priority (1=highest, 5=lowest)"
                },
                status: {
                  type: "string",
                  enum: ["Open", "InProgress", "Completed", "Waiting", "Canceled"],
                  description: "Task status"
                },
                isMIT: {
                  type: "boolean",
                  description: "Whether this is a Most Important Task"
                },
                tags: {
                  type: "array",
                  items: {
                    type: "string"
                  },
                  description: "Tags for the task"
                }
              },
              required: ["title"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "updateTask",
            description: "Update an existing task",
            parameters: {
              type: "object",
              properties: {
                taskId: {
                  type: "string",
                  description: "Task ID to update"
                },
                title: {
                  type: "string",
                  description: "New task title"
                },
                description: {
                  type: "string",
                  description: "New task description"
                },
                status: {
                  type: "string",
                  enum: ["Open", "InProgress", "Completed", "Waiting", "Canceled"],
                  description: "New task status"
                },
                dueDate: {
                  type: "string",
                  description: "New due date in ISO format (YYYY-MM-DD)"
                },
                priority: {
                  type: "number",
                  enum: [1, 2, 3, 4, 5],
                  description: "New task priority (1=highest, 5=lowest)"
                },
                isMIT: {
                  type: "boolean",
                  description: "Whether this is a Most Important Task"
                },
                tags: {
                  type: "array",
                  items: {
                    type: "string"
                  },
                  description: "Tags for the task"
                }
              },
              required: ["taskId"]
            }
          }
        }
      ]
    });

    console.log('✅ Assistant created successfully!');
    console.log(`📋 Assistant ID: ${assistant.id}`);
    console.log(`📝 Assistant Name: ${assistant.name}`);
    console.log('');
    console.log('🔧 Add this to your .env.local file:');
    console.log(`OPENAI_ASSISTANT_ID=${assistant.id}`);
    console.log('');
    console.log('🚀 Your TaskVision AI Assistant is now configured with the correct function definitions!');
    console.log('');
    console.log('📝 Next steps:');
    console.log('1. Update your .env.local file with the new OPENAI_ASSISTANT_ID');
    console.log('2. Restart your backend server');
    console.log('3. Test the "list my tasks" command in TVAgent');

  } catch (error) {
    console.error('❌ Error creating assistant:', error);
    if (error.status === 401) {
      console.log('🔑 Please check your OPENAI_API_KEY is valid');
    }
    process.exit(1);
  }
}

createAssistant(); 