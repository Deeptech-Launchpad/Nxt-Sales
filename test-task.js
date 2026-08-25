const http = require('http');
const url = require('url');

// Simulate logging in and testing task creation
async function test() {
  try {
    console.log('Testing task creation flow...\n');

    // Step 1: Get all contacts
    console.log('Step 1: Fetching contacts...');
    const contactsReq = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/contacts',
      method: 'GET',
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNtMmZwYzAzbjAwMDAzdXU0ZTNpdWZseHciLCJpYXQiOjE2MzU3NDAwMDB9.0a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a',
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const contacts = JSON.parse(data);
          if (contacts.length > 0) {
            const contact = contacts[0];
            console.log(`✓ Found contact: "${contact.name}" (ID: ${contact.id})\n`);
            testTaskCreation(contact.id, contact.name);
          } else {
            console.log('✗ No contacts found. Create a contact first.\n');
            process.exit(1);
          }
        } catch (e) {
          console.log('✗ Error parsing contacts:', data);
          process.exit(1);
        }
      });
    });
    contactsReq.on('error', console.error);
    contactsReq.end();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

function testTaskCreation(contactId, contactName) {
  console.log('Step 2: Creating task...');

  const taskData = JSON.stringify({
    type: 'task',
    contactId: contactId,
    title: 'Follow up with ' + contactName,
    body: 'Test task created at ' + new Date().toISOString(),
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    priority: 'high',
    taskStatus: 'not_started'
  });

  const taskReq = http.request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/activities',
    method: 'POST',
    headers: {
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNtMmZwYzAzbjAwMDAzdXU0ZTNpdWZseHciLCJpYXQiOjE2MzU3NDAwMDB9.0a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a',
      'Content-Type': 'application/json',
      'Content-Length': taskData.length
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const task = JSON.parse(data);
        if (res.statusCode === 201 && task.id) {
          console.log(`✓ Task created successfully!`);
          console.log(`  ID: ${task.id}`);
          console.log(`  Title: ${task.title}`);
          console.log(`  Priority: ${task.priority}`);
          console.log(`  Due Date: ${task.dueDate}`);
          console.log(`  Status: ${task.taskStatus}\n`);

          console.log('Step 3: Verifying task in activities timeline...');
          verifyTask(contactId, task.id);
        } else {
          console.log('✗ Task creation failed:', data);
          process.exit(1);
        }
      } catch (e) {
        console.log('✗ Error parsing task response:', data);
        process.exit(1);
      }
    });
  });

  taskReq.on('error', console.error);
  taskReq.write(taskData);
  taskReq.end();
}

function verifyTask(contactId, taskId) {
  const activitiesReq = http.request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/activities?contactId=${contactId}&type=task`,
    method: 'GET',
    headers: {
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNtMmZwYzAzbjAwMDAzdXU0ZTNpdWZseHciLCJpYXQiOjE2MzU3NDAwMDB9.0a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a',
      'Content-Type': 'application/json'
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const tasks = JSON.parse(data);
        const found = tasks.find(t => t.id === taskId);
        if (found) {
          console.log('✓ Task found in activities timeline!');
          console.log(`  Total tasks for this contact: ${tasks.length}\n`);
          console.log('✅ TASK CREATION TEST PASSED!\n');
          console.log('Frontend is ready at: http://localhost:3000');
          console.log('Navigate to Contacts, click on a contact, and click the "Task" button to create tasks via the UI.');
        } else {
          console.log('✗ Task not found in activities');
          process.exit(1);
        }
      } catch (e) {
        console.log('✗ Error verifying task:', data);
        process.exit(1);
      }
    });
  });

  activitiesReq.on('error', console.error);
  activitiesReq.end();
}

test();
