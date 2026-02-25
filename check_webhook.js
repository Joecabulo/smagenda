
const https = require('https');

const apiKey = 'e02a14689879009dc7dcd4566cefaf4bd7b6c9ddd1fc5c0b5bfa81723a6ea67e';
const apiUrl = 'https://evolution.singlemotion.org';
const instanceName = 'singlemotion';

const options = {
  hostname: 'evolution.singlemotion.org',
  path: `/webhook/find/${instanceName}`,
  method: 'GET',
  headers: {
    'apikey': apiKey,
    'Content-Type': 'application/json'
  }
};

console.log(`Verificando webhook para ${instanceName}...`);

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
  console.error('Erro na requisição:', error);
});

req.end();
