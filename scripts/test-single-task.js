#!/usr/bin/env node

/**
 * Test creating a single task with existing 300+ tasks
 */

const token = process.argv[2];

if (!token) {
  console.error('Usage: node test-single-task.js <AUTH0_TOKEN>');
  process.exit(1);
}

const API_URL = 'http://localhost:6060';

async function createTestTask() {
  console.log('🧪 Testing single task creation with 300+ existing tasks...\n');
  
  const startTime = Date.now();
  
  const taskData = {
    title: `Performance Test Task ${new Date().toISOString()}`,
    description: 'Testing optimized task creation after fixes',
    status: 'Open',
    isMIT: true,
    dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    priority: 1,
    tags: ['performance-test']
  };

  try {
    const response = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(taskData)
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Failed: ${response.status} ${errorText}`);
      console.error(`⏱️  Time taken: ${duration}ms`);
      process.exit(1);
    }

    const result = await response.json();
    
    console.log('✅ SUCCESS!');
    console.log(`⏱️  Total time: ${duration}ms`);
    console.log(`📝 Task created: ${result.title}`);
    console.log(`🆔 Task ID: ${result.TaskId}`);
    console.log(`🎯 Type: ${result.isMIT ? 'MIT' : 'LIT'}`);
    console.log(`\n💡 Performance improvement analysis:`);
    
    if (duration < 500) {
      console.log(`   🚀 EXCELLENT - Under 500ms (${duration}ms)`);
    } else if (duration < 1000) {
      console.log(`   ✅ GOOD - Under 1 second (${duration}ms)`);
    } else if (duration < 2000) {
      console.log(`   ⚠️  ACCEPTABLE - Under 2 seconds (${duration}ms)`);
    } else {
      console.log(`   ❌ SLOW - Over 2 seconds (${duration}ms) - needs more optimization`);
    }
    
    console.log(`\n📊 Check backend logs for detailed timing:\n   tail -f ~/.local/share/taskvision/logs/backend.log\n`);
    
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.error(`❌ Error after ${duration}ms:`, error.message);
    process.exit(1);
  }
}

createTestTask();

