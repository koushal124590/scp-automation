const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const http = require('http');
const url = require('url');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

async function authorize() {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  
  const redirectUri = 'http://localhost:3000';
  const oauth2Client = new google.auth.OAuth2(
    key.client_id,
    key.client_secret,
    redirectUri
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });

  console.log('\n======================================================');
  console.log('🔗 CLICK THIS LINK TO AUTHORIZE THE APP:');
  console.log(authUrl);
  console.log('======================================================\n');

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        if (req.url.indexOf('/') > -1) {
          const qs = new url.URL(req.url, 'http://localhost:3000').searchParams;
          const code = qs.get('code');
          if (code) {
            res.end('Authentication successful! You can close this tab and return to the terminal.');
            server.close();
            
            const { tokens } = await oauth2Client.getToken(code);
            oauth2Client.setCredentials(tokens);
            
            const payload = JSON.stringify({
              type: 'authorized_user',
              client_id: key.client_id,
              client_secret: key.client_secret,
              refresh_token: tokens.refresh_token || tokens.access_token,
            });
            await fs.writeFile(TOKEN_PATH, payload);
            console.log('✅ Token saved successfully to token.json');
            resolve(oauth2Client);
          } else {
             if (req.url !== '/favicon.ico') {
                 res.end('Waiting for authentication...');
             }
          }
        }
      } catch (e) {
        reject(e);
      }
    });

    server.listen(3000, () => {
      console.log('Listening on port 3000 for the Google redirect...');
    });
  });
}

authorize().then(() => {
  console.log('🎉 You are all set! You can now start the main server.');
  process.exit(0);
}).catch(console.error);
