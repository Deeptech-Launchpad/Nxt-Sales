const http = require('http');

// Helper to make HTTP requests
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: method,
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNtMmZwYzAzbjAwMDAzdXU0ZTNpdWZseHciLCJpYXQiOjE2MzU3NDAwMDB9.0a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a',
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      const dataStr = JSON.stringify(data);
      options.headers['Content-Length'] = dataStr.length;
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function run() {
  try {
    console.log('Creating test contact...');
    const contactRes = await makeRequest('POST', '/api/contacts', {
      name: 'Alice Johnson',
      email: 'alice@example.com',
      phone: '555-0001',
      website: 'https://alice.example.com',
      company: 'Acme Corp',
      industry: 'Technology',
      lifecycleStage: 'lead',
      leadStatus: 'new'
    });

    if (contactRes.status !== 201) {
      console.log('✗ Failed to create contact:', contactRes);
      process.exit(1);
    }

    const contact = contactRes.data;
    console.log(`✓ Contact created: "${contact.name}" (ID: ${contact.id})\n`);

    console.log('Creating task for this contact...');
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    const taskRes = await makeRequest('POST', '/api/activities', {
      type: 'task',
      contactId: contact.id,
      title: 'Follow up with ' + contact.name,
      body: 'Test task created via API',
      dueDate: dueDate.toISOString(),
      priority: 'high',
      taskStatus: 'not_started'
    });

    if (taskRes.status !== 201) {
      console.log('✗ Failed to create task:', taskRes);
      process.exit(1);
    }

    const task = taskRes.data;
    console.log(`✓ Task created successfully!`);
    console.log(`  ID: ${task.id}`);
    console.log(`  Title: ${task.title}`);
    console.log(`  Priority: ${task.priority}`);
    console.log(`  Due: ${new Date(task.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`);
    console.log(`  Status: ${task.taskStatus}\n`);

    console.log('Fetching all tasks for this contact...');
    const tasksRes = await makeRequest('GET', `/api/activities?contactId=${contact.id}&type=task`, null);
    const tasks = tasksRes.data;
    console.log(`✓ Found ${tasks.length} task(s) for this contact\n`);

    console.log('✅ ALL TESTS PASSED!\n');
    console.log('Now open http://localhost:3000 in your browser:');
    console.log(`  1. Go to Contacts`);
    console.log(`  2. Click on "${contact.name}"`);
    console.log(`  3. Go to the "Activities" tab`);
    console.log(`  4. Click on "Create a task" to see the task modal`);
    console.log(`  5. You should see your newly created task in the timeline\n`);

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
