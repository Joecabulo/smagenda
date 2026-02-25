
const https = require('https');

const apiKey = 'e02a14689879009dc7dcd4566cefaf4bd7b6c9ddd1fc5c0b5bfa81723a6ea67e';
const functionUrl = 'https://ttecpztkoaxwttludgfl.supabase.co/functions/v1/whatsapp';
const fullUrl = `${functionUrl}?apikey=${apiKey}`;

// Payload simulando mensagem "Agendar" da Evolution API v2
const payload = {
  event: 'messages.upsert',
  instance: 'singlemotion',
  data: {
    key: {
      remoteJid: '5511999999999@s.whatsapp.net',
      fromMe: false,
      id: 'TEST_ID_' + Date.now()
    },
    pushName: 'Tester',
    message: {
      conversation: 'Agendar'
    },
    messageType: 'conversation',
    source: 'ios'
  },
  sender: '5511999999999@s.whatsapp.net'
};

const options = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

console.log(`Simulando envio de 'Agendar' para ${fullUrl}...`);

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
