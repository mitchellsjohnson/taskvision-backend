const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function updateAssistant() {
  try {
    const assistantId = 'asst_gFRKvaXhPCOSHomcKruZDJaY'; // Your assistant ID
    
    console.log('🔄 Updating TaskVision AI Assistant with MIT functions...');
    console.log(`📋 Assistant ID: ${assistantId}`);
    
    // Get current assistant
    const currentAssistant = await openai.beta.assistants.retrieve(assistantId);
    console.log(`📝 Current Assistant: ${currentAssistant.name}`);
    
    // Add the new MIT functions to existing tools
    const newMitFunctions = [
      {
        type: "function",
        function: {
          name: "make_task_mit",
          description: "Make a task a Most Important Task (MIT) with specific priority. MIT tasks are limited to 3 total. If making a 4th MIT task, the lowest priority MIT task will be moved to LIT.",
          parameters: {
            type: "object",
            properties: {
              task_id: {
                type: "string",
                description: "The ID of the task to make MIT"
              },
              priority: {
                type: "number",
                enum: [1, 2, 3],
                description: "Priority within MIT list (1=highest, 2=medium, 3=lowest). Defaults to 1 if not specified."
              }
            },
            required: ["task_id"]
          }
        }
      },
      {
        type: "function", 
        function: {
          name: "remove_mit_status",
          description: "Remove MIT (Most Important Task) status from a task, moving it to the LIT (Less Important Tasks) list",
          parameters: {
            type: "object",
            properties: {
              task_id: {
                type: "string",
                description: "The ID of the task to remove MIT status from"
              }
            },
            required: ["task_id"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_mit_tasks", 
          description: "Get all current MIT (Most Important Tasks) ordered by priority",
          parameters: {
            type: "object",
            properties: {},
            required: []
          }
        }
      }
    ];
    
    // Update the assistant with new functions
    const updatedAssistant = await openai.beta.assistants.update(assistantId, {
      tools: [...currentAssistant.tools, ...newMitFunctions]
    });
    
    console.log('✅ Assistant updated successfully!');
    console.log(`📋 Updated Assistant ID: ${updatedAssistant.id}`);
    console.log(`📝 Assistant Name: ${updatedAssistant.name}`);
    console.log(`🔧 Total Functions: ${updatedAssistant.tools.length}`);
    console.log('');
    console.log('🆕 New MIT Functions Added:');
    console.log('  • make_task_mit - Make a task MIT with specific priority (1-3)');
    console.log('  • remove_mit_status - Remove MIT status from a task');
    console.log('  • get_mit_tasks - Get all current MIT tasks ordered by priority');
    console.log('');
    console.log('🚀 Your TaskVision AI Assistant now supports MIT management!');
    console.log('');
    console.log('📝 You can now use commands like:');
    console.log('  • "Make task [name] MIT priority 2"');
    console.log('  • "Remove MIT status from [task]"');
    console.log('  • "Show me my MIT tasks"');
    console.log('  • "What are my most important tasks?"');

  } catch (error) {
    console.error('❌ Error updating assistant:', error);
    if (error.status === 401) {
      console.log('🔑 Please check your OPENAI_API_KEY is valid');
    } else if (error.status === 404) {
      console.log('🔍 Assistant not found. Please check the ASSISTANT_ID');
    }
    process.exit(1);
  }
}

updateAssistant(); 