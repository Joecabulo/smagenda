
const https = require('https');

const apiKey = 'e02a14689879009dc7dcd4566cefaf4bd7b6c9ddd1fc5c0b5bfa81723a6ea67e';
const functionUrl = 'https://ttecpztkoaxwttludgfl.supabase.co/functions/v1/whatsapp';
const fullUrl = `${functionUrl}?apikey=${apiKey}`;

const payload = {
  event: 'status',
  data: {
    status: 'open'
  }
};

const options = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

console.log(`Testando webhook em ${fullUrl}...`);

const req = https.request(fullUrl, options, (res) => {
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
  console.error('Erro na requisição:', error);
});

req.write(JSON.stringify(payload));
req.end();
