#!/usr/bin/env node

/**
 * Load Test Script for TaskVision API
 * Creates 300 tasks, cancels 100, and completes 100
 */

const readline = require('readline');

const API_URL = process.env.API_URL || 'http://localhost:6060';

// Helper to get user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

// Helper to generate random date in the next 30 days
function getRandomDueDate() {
  const today = new Date();
  const daysFromNow = Math.floor(Math.random() * 30) + 1;
  const dueDate = new Date(today);
  dueDate.setDate(today.getDate() + daysFromNow);
  return dueDate.toISOString().split('T')[0]; // YYYY-MM-DD format
}

// Helper to randomly assign MIT/LIT
function getRandomMIT() {
  return Math.random() < 0.3; // 30% chance of being MIT
}

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createTask(token, taskNumber) {
  const taskData = {
    title: `Task API Create ${taskNumber}`,
    description: `Load test task #${taskNumber} created at ${new Date().toISOString()}`,
    status: 'Open',
    isMIT: getRandomMIT(),
    dueDate: getRandomDueDate(),
    priority: 1,
    tags: ['load-test', `batch-${Math.ceil(taskNumber / 50)}`]
  };

  const response = await fetch(`${API_URL}/api/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(taskData)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create task ${taskNumber}: ${response.status} ${errorText}`);
  }

  return response.json();
}

async function updateTaskStatus(token, taskId, status) {
  const response = await fetch(`${API_URL}/api/tasks/${taskId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ status })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to update task ${taskId}: ${response.status} ${errorText}`);
  }

  return response.json();
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       TaskVision API Load Test - Task Creation            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`Target API: ${API_URL}\n`);
  console.log('This script will:');
  console.log('  1. Create 300 tasks with random MIT/LIT and due dates');
  console.log('  2. Cancel 100 randomly selected tasks');
  console.log('  3. Complete 100 randomly selected tasks');
  console.log('  4. Leave 100 tasks as Open\n');

  // Get Auth0 token from user
  console.log('To get your Auth0 token:');
  console.log('  1. Open http://localhost:4040 in your browser');
  console.log('  2. Login to TaskVision');
  console.log('  3. Open browser DevTools (F12)');
  console.log('  4. Go to Console tab');
  console.log('  5. Run: localStorage.getItem("@@auth0spajs@@::YOUR_CLIENT_ID::YOUR_AUDIENCE::openid profile email")');
  console.log('  6. Copy the "access_token" value from the JSON\n');

  const token = await question('Enter your Auth0 access token: ');
  
  if (!token || token.trim().length < 10) {
    console.error('❌ Invalid token provided. Exiting.');
    rl.close();
    process.exit(1);
  }

  console.log('\n✅ Token received. Starting load test...\n');

  const createdTasks = [];
  const startTime = Date.now();
  
  // Phase 1: Create 300 tasks
  console.log('📝 PHASE 1: Creating 300 tasks...');
  console.log('─────────────────────────────────────────────────────────────');
  
  for (let i = 1; i <= 300; i++) {
    try {
      const task = await createTask(token, i);
      createdTasks.push(task);
      
      if (i % 10 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = (i / (elapsed || 1)).toFixed(1);
        process.stdout.write(`\r✓ Created ${i}/300 tasks (${rate} tasks/sec, ${elapsed}s elapsed)`);
      }
      
      // Small delay to avoid overwhelming the API
      if (i % 50 === 0) {
        await sleep(1000); // 1 second pause every 50 tasks
      } else {
        await sleep(100); // 100ms between tasks
      }
    } catch (error) {
      console.error(`\n❌ Error creating task ${i}:`, error.message);
      // Continue with next task
    }
  }

  const createTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Created ${createdTasks.length} tasks in ${createTime}s\n`);

  // Phase 2: Cancel 100 random tasks
  console.log('🚫 PHASE 2: Canceling 100 tasks...');
  console.log('─────────────────────────────────────────────────────────────');
  
  const shuffled = [...createdTasks].sort(() => Math.random() - 0.5);
  const tasksToCancel = shuffled.slice(0, 100);
  
  let cancelCount = 0;
  const cancelStart = Date.now();
  
  for (const task of tasksToCancel) {
    try {
      await updateTaskStatus(token, task.TaskId, 'Canceled');
      cancelCount++;
      
      if (cancelCount % 10 === 0) {
        const elapsed = ((Date.now() - cancelStart) / 1000).toFixed(1);
        process.stdout.write(`\r✓ Canceled ${cancelCount}/100 tasks (${elapsed}s elapsed)`);
      }
      
      await sleep(100);
    } catch (error) {
      console.error(`\n❌ Error canceling task ${task.TaskId}:`, error.message);
    }
  }

  const cancelTime = ((Date.now() - cancelStart) / 1000).toFixed(1);
  console.log(`\n✅ Canceled ${cancelCount} tasks in ${cancelTime}s\n`);

  // Phase 3: Complete 100 random tasks (excluding canceled ones)
  console.log('✔️  PHASE 3: Completing 100 tasks...');
  console.log('─────────────────────────────────────────────────────────────');
  
  const remainingTasks = shuffled.slice(100);
  const tasksToComplete = remainingTasks.slice(0, 100);
  
  let completeCount = 0;
  const completeStart = Date.now();
  
  for (const task of tasksToComplete) {
    try {
      await updateTaskStatus(token, task.TaskId, 'Completed');
      completeCount++;
      
      if (completeCount % 10 === 0) {
        const elapsed = ((Date.now() - completeStart) / 1000).toFixed(1);
        process.stdout.write(`\r✓ Completed ${completeCount}/100 tasks (${elapsed}s elapsed)`);
      }
      
      await sleep(100);
    } catch (error) {
      console.error(`\n❌ Error completing task ${task.TaskId}:`, error.message);
    }
  }

  const completeTime = ((Date.now() - completeStart) / 1000).toFixed(1);
  console.log(`\n✅ Completed ${completeCount} tasks in ${completeTime}s\n`);

  // Summary
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    LOAD TEST SUMMARY                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log(`  📊 Tasks Created:  ${createdTasks.length}/300`);
  console.log(`  🚫 Tasks Canceled: ${cancelCount}/100`);
  console.log(`  ✔️  Tasks Completed: ${completeCount}/100`);
  console.log(`  📋 Tasks Open:     ${createdTasks.length - cancelCount - completeCount}`);
  console.log(`\n  ⏱️  Total Time:    ${totalTime}s`);
  console.log(`  ⏱️  Create Time:   ${createTime}s`);
  console.log(`  ⏱️  Cancel Time:   ${cancelTime}s`);
  console.log(`  ⏱️  Complete Time: ${completeTime}s`);
  console.log(`\n  📈 Average:       ${(createdTasks.length / totalTime).toFixed(2)} operations/sec`);
  
  const mitCount = createdTasks.filter(t => t.isMIT).length;
  const litCount = createdTasks.length - mitCount;
  console.log(`\n  🎯 MIT Tasks:     ${mitCount} (${((mitCount/createdTasks.length)*100).toFixed(1)}%)`);
  console.log(`  📝 LIT Tasks:     ${litCount} (${((litCount/createdTasks.length)*100).toFixed(1)}%)`);
  
  console.log('\n✨ Load test complete!\n');
  console.log('Now try creating a new task in the UI to see if it times out.');
  console.log('Check backend logs: tail -f ~/.local/share/taskvision/logs/backend.log\n');

  rl.close();
}

main().catch(error => {
  console.error('\n💥 Fatal error:', error);
  rl.close();
  process.exit(1);
});

