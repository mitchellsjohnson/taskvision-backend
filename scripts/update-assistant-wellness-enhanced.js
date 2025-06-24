#!/usr/bin/env node

/**
 * Script to update the OpenAI Assistant with enhanced wellness and date awareness
 * 
 * Usage:
 * 1. Set OPENAI_API_KEY environment variable
 * 2. Run: node scripts/update-assistant-wellness-enhanced.js
 */

const OpenAI = require('openai');
require('dotenv').config();

async function updateAssistant() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    console.log('Set it with: export OPENAI_API_KEY="your_api_key_here"');
    process.exit(1);
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    const assistantId = process.env.OPENAI_ASSISTANT_ID || 'asst_gFRKvaXhPCOSHomcKruZDJaY';
    
    console.log('🔄 Updating TaskVision AI Assistant with enhanced wellness and date awareness...');
    console.log(`📋 Assistant ID: ${assistantId}`);
    
    // Get current assistant
    const currentAssistant = await openai.beta.assistants.retrieve(assistantId);
    console.log(`📝 Current Assistant: ${currentAssistant.name}`);
    
    // Enhanced instructions with date and wellness awareness
    const enhancedInstructions = `You are TaskVision AI Assistant, a helpful task management and wellness assistant. You help users manage their tasks, track wellness practices, set priorities, and maintain work-life balance.

IMPORTANT DATE AWARENESS:
- Always assume "this week" means the current week starting on Monday
- Today's date is ${new Date().toISOString().split('T')[0]}
- Current week starts on ${getWeekStart(new Date())}
- When users ask about wellness without specifying a week, assume they mean the current week
- You can calculate dates, weeks, and provide context about time periods

WELLNESS CAPABILITIES:
- Track 6 wellness practices with specific frequency requirements:
  - Gratitude: Daily (7x/week)
  - Meditation: Daily (7x/week) 
  - Kindness: 2x/week
  - Social Outreach: 2x/week
  - Novelty Challenge: 2x/week
  - Savoring Reflection: Weekly (1x/week)
- Provide wellness coaching and suggestions
- Calculate wellness scores (0-100) based on completion rates
- Create wellness-related tasks and link them to practices
- Offer personalized wellness guidance based on user's history

TASK MANAGEMENT CAPABILITIES:
- List and filter tasks by status, priority, or due date
- Create new tasks with titles, descriptions, due dates, and priorities
- Update existing tasks (status, priority, due date)
- Mark tasks as complete or incomplete
- Manage MIT (Most Important Tasks) with 3-task limit
- Provide task summaries and insights
- Help with task prioritization and time management

COMMUNICATION STYLE:
- Be conversational, friendly, and proactive
- Provide specific, actionable information
- Use wellness scores and data to give meaningful feedback
- Offer encouragement for good wellness performance
- Provide gentle coaching for areas needing improvement
- Always be helpful and supportive

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
- 5: Lowest priority (someday/maybe)`;

    // Enhanced wellness and date functions
    const enhancedFunctions = [
      {
        type: "function",
        function: {
          name: "get_current_date",
          description: "Get the current date and week information",
          parameters: {
            type: "object",
            properties: {},
            required: []
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_week_start",
          description: "Get the Monday date for any given week or date",
          parameters: {
            type: "object",
            properties: {
              date: {
                type: "string",
                description: "Date in YYYY-MM-DD format (optional, defaults to current date)"
              }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_wellness_status_detailed",
          description: "Get detailed wellness status for a specific week with scores, completion rates, and coaching insights",
          parameters: {
            type: "object",
            properties: {
              weekStart: {
                type: "string",
                description: "Monday date of the week in YYYY-MM-DD format (optional, defaults to current week)"
              }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_wellness_history",
          description: "Get wellness scores and trends over multiple weeks",
          parameters: {
            type: "object",
            properties: {
              weeks: {
                type: "number",
                description: "Number of weeks to retrieve (default: 4)"
              }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "list_recent_wellness_tasks",
          description: "Get recent completed tasks for specific wellness practices",
          parameters: {
            type: "object",
            properties: {
              practice: {
                type: "string",
                enum: ["Gratitude", "Meditation", "Kindness", "Social Outreach", "Novelty Challenge", "Savoring Reflection"],
                description: "The wellness practice to get tasks for"
              },
              limit: {
                type: "number",
                description: "Maximum number of tasks to return (default: 3)"
              }
            },
            required: ["practice"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_wellness_task_suggestion",
          description: "Create a wellness-related task with proper tagging and linking",
          parameters: {
            type: "object",
            properties: {
              practice: {
                type: "string",
                enum: ["Gratitude", "Meditation", "Kindness", "Social Outreach", "Novelty Challenge", "Savoring Reflection"],
                description: "The wellness practice this task relates to"
              },
              title: {
                type: "string",
                description: "Task title"
              },
              description: {
                type: "string",
                description: "Task description"
              },
              date: {
                type: "string",
                description: "Date for the practice in YYYY-MM-DD format (optional, defaults to today)"
              }
            },
            required: ["practice", "title"]
          }
        }
      }
    ];
    
    // Combine with existing functions
    const allFunctions = [...currentAssistant.tools, ...enhancedFunctions];
    
    // Update the assistant
    const updatedAssistant = await openai.beta.assistants.update(assistantId, {
      instructions: enhancedInstructions,
      tools: allFunctions
    });
    
    console.log('✅ Assistant updated successfully!');
    console.log(`📋 Updated Assistant ID: ${updatedAssistant.id}`);
    console.log(`📝 Assistant Name: ${updatedAssistant.name}`);
    console.log(`🔧 Total Functions: ${updatedAssistant.tools.length}`);
    console.log('');
    console.log('🆕 Enhanced Capabilities Added:');
    console.log('  • Date awareness - knows current date and week calculations');
    console.log('  • Detailed wellness status with scores and coaching');
    console.log('  • Wellness history and trends over multiple weeks');
    console.log('  • Enhanced wellness task creation and linking');
    console.log('  • Automatic week start calculation (Monday-based)');
    console.log('');
    console.log('🎯 New Functions Added:');
    console.log('  • get_current_date - Get current date and week info');
    console.log('  • get_week_start - Calculate Monday for any date');
    console.log('  • get_wellness_status_detailed - Enhanced wellness status');
    console.log('  • get_wellness_history - Multi-week wellness trends');
    console.log('  • Enhanced list_recent_wellness_tasks');
    console.log('  • Enhanced create_wellness_task_suggestion');
    console.log('');
    console.log('🚀 Your TaskVision AI Assistant now has enhanced wellness and date awareness!');
    console.log('');
    console.log('📝 You can now use commands like:');
    console.log('  • "How are we doing this week on wellness tasks?"');
    console.log('  • "What\'s my wellness score for this week?"');
    console.log('  • "Show me wellness trends over the past month"');
    console.log('  • "Create a gratitude task for today"');
    console.log('  • "What week starts on June 16, 2025?"');

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

// Helper function to get week start (Monday)
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

updateAssistant(); 