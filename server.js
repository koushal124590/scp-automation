require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { google } = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');
const fs = require('fs').promises;
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json());

// Serve the React Dashboard
app.use(express.static(path.join(__dirname, 'frontend/dist')));

// Configure Multer for File Uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, __dirname) // Save to root directory
    },
    filename: function (req, file, cb) {
        // Enforce exact filenames
        if(file.originalname === 'credentials.json' || file.originalname === 'token.json') {
            cb(null, file.originalname);
        } else {
            cb(new Error("Invalid filename. Only credentials.json or token.json allowed."));
        }
    }
});
const upload = multer({ storage: storage });

// API to save user configurations (In a real app, this goes to Firestore. Here we save locally to config.json)
const CONFIG_FILE = path.join(__dirname, 'config.json');

app.post('/api/config', async (req, res) => {
    try {
        await fs.writeFile(CONFIG_FILE, JSON.stringify(req.body, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/config', async (req, res) => {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.json({ active: false, customText: 'How can I help you today? Please leave your message and wait for a reply within 5 minutes.' });
    }
});

// Endpoint to upload credentials
app.post('/api/upload-credentials', upload.array('credentials', 2), (req, res) => {
    try {
        res.json({ success: true, message: 'Files uploaded successfully.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Global Status State for the Polling Engine
let engineStatus = {
    isRunning: false,
    lastChecked: null,
    error: null,
    messagesProcessed: 0
};

// Endpoint to get bot status
app.get('/api/status', (req, res) => {
    res.json(engineStatus);
});

// The Failproof Polling Engine
setInterval(async () => {
    try {
        let config;
        try {
            config = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
        } catch(e) { return; } // No config yet

        if (!config.active) {
            engineStatus.isRunning = false;
            engineStatus.error = "Bot is manually disabled.";
            return;
        }

        const tokenPath = path.join(__dirname, 'token.json');
        const credPath = path.join(__dirname, 'credentials.json');
        
        let token, credentials;
        try {
            token = JSON.parse(await fs.readFile(tokenPath, 'utf8'));
            credentials = JSON.parse(await fs.readFile(credPath, 'utf8'));
        } catch(e) {
            engineStatus.isRunning = false;
            engineStatus.error = "Missing credentials.json or token.json. Please upload them.";
            return;
        }

        const auth = google.auth.fromJSON(credentials);
        auth.setCredentials(token);
        const gmail = google.gmail({ version: 'v1', auth });

        const res = await gmail.users.messages.list({
            userId: 'me',
            q: 'is:unread',
            maxResults: 20
        });
        
        engineStatus.isRunning = true;
        engineStatus.error = null;
        engineStatus.lastChecked = new Date().toISOString();

        const messages = res.data.messages;
        if (!messages || messages.length === 0) return;

        console.log(`Processing ${messages.length} unread messages...`);

        for (const msg of messages) {
            const message = await gmail.users.messages.get({ userId: 'me', id: msg.id });
            const headers = message.data.payload.headers;
            const fromHeader = headers.find(h => h.name === 'From');
            const messageIdHeader = headers.find(h => h.name === 'Message-ID');

            const fromMatch = fromHeader.value.match(/<([^>]+)>/);
            const fromEmail = fromMatch ? fromMatch[1] : fromHeader.value;
            const messageId = messageIdHeader ? messageIdHeader.value : '';

            // Filter business
            const isBusinessOrOther = /@(?!gmail\.com|yahoo\.com|outlook\.com|hotmail\.com|aol\.com|icloud\.com)[^\s@]+\.[^\s@]+/.test(fromEmail);
            if (isBusinessOrOther || fromEmail.includes('noreply')) {
                await gmail.users.messages.modify({ userId: 'me', id: msg.id, requestBody: { removeLabelIds: ['UNREAD'] }});
                continue;
            }

            console.log(`Auto-replying to: ${fromEmail}`);

            const htmlBody = `
            <div style="font-family: Arial, sans-serif; text-align: center; max-width: 600px; margin: 0 auto;">
                <img src="cid:logo" alt="Logo" style="max-width: 150px; margin-bottom: 20px;" />
                <br/>
                <img src="cid:card" alt="Business Card" style="max-width: 100%; border-radius: 8px;" />
                <p style="margin-top: 30px; font-size: 16px; color: #333;">
                    <strong>${config.customText || 'How can I help you today? Please leave your message and wait for a reply within 5 minutes.'}</strong>
                </p>
            </div>`;

            const mailOptions = {
                to: fromEmail,
                from: 'me',
                subject: 'Auto Reply',
                html: htmlBody,
                inReplyTo: messageId,
                references: messageId,
                attachments: [
                    { filename: 'logo.gif', path: path.join(__dirname, 'gif', '3d-logo-spinning.gif'), cid: 'logo' },
                    { filename: 'card.svg', path: path.join(__dirname, 'public', 'card.svg'), cid: 'card' }
                ]
            };
            
            const mail = new MailComposer(mailOptions);
            const messageCompiled = await mail.compile().build();
            const rawMessage = messageCompiled.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

            await gmail.users.messages.send({
                userId: 'me',
                requestBody: { raw: rawMessage, threadId: messageId ? undefined : undefined }
            });
            
            await gmail.users.messages.modify({ userId: 'me', id: msg.id, requestBody: { removeLabelIds: ['UNREAD'] }});
            engineStatus.messagesProcessed++;
        }
    } catch (error) {
        console.error('Error polling Gmail:', error.message);
        engineStatus.isRunning = false;
        engineStatus.error = error.message;
    }
}, 30000); // 30 seconds

// Catch-all route to serve React app for client-side routing
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`SCP Dashboard online at http://localhost:${PORT}`);
    console.log('Local failproof engine is running in the background!');
});
