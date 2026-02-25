
const https = require('https');

const projectRef = 'ttecpztkoaxwttludgfl';
const token = 'sbp_9f9b4587ae08026d393ee2464faae495f6c6e4f8';
const query = 'select * from super_admin;';

const options = {
  hostname: 'api.supabase.com',
  path: `/v1/projects/${projectRef}/database/query`,
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log(`Status Code: ${res.statusCode}`);
    console.log('Body:', data);
  });
});

req.on('error', (error) => {
  console.error(error);
});

req.write(JSON.stringify({ query }));
req.end();
