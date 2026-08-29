const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

async function test() {
    try {
        console.log('Testing token.json...');
        const tokenRaw = fs.readFileSync(path.join(__dirname, '..', 'token.json'), 'utf8');
        const token = JSON.parse(tokenRaw);
        console.log('Token parsed:', { client_id: token.client_id, has_refresh: !!token.refresh_token });
        
        const auth = google.auth.fromJSON(token);
        const gmail = google.gmail({ version: 'v1', auth });
        
        console.log('Calling gmail.users.getProfile({ userId: "me" })...');
        const profile = await gmail.users.getProfile({ userId: 'me' });
        console.log('SUCCESS! Connected as:', profile.data.emailAddress, 'Total messages:', profile.data.messagesTotal);
    } catch (err) {
        console.error('ERROR during auth test:', err.message);
        if (err.response) {
            console.error('Response status:', err.response.status, err.response.data);
        }
    }
}

test();
