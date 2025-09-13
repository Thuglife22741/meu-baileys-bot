const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const qrcode = require('qrcode');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.get('/', (req, res) => {
  res.send('Servidor Baileys WebSocket está rodando!');
});

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  wss.on('connection', (ws) => {
    console.log('Novo cliente WebSocket conectado');

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        qrcode.toDataURL(qr, (err, url) => {
          if (err) {
            console.error('Erro ao gerar QR code:', err);
            ws.send(JSON.stringify({ type: 'error', message: 'Falha ao gerar QR code' }));
            return;
          }
          ws.send(JSON.stringify({ type: 'qr', data: url }));
        });
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('Conexão fechada, reconectando:', shouldReconnect);
        if (shouldReconnect) {
          connectToWhatsApp();
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Deslogado, reinicie' }));
        }
      }

      if (connection === 'open') {
        ws.send(JSON.stringify({ type: 'connected', message: 'WhatsApp conectado!' }));
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      const messages = m.messages;
      for (const msg of messages) {
        console.log('Mensagem recebida:', msg);
        ws.send(JSON.stringify({ type: 'message', data: msg }));
      }
    });

    ws.on('close', () => {
      console.log('Cliente WebSocket desconectado');
    });
  });

  sock.ev.on('creds.update', saveCreds);
}

connectToWhatsApp().catch((err) => {
  console.error('Erro na conexão com o WhatsApp:', err);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});