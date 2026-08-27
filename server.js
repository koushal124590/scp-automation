require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { google } = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');
const fs = require('fs').promises;
const fsSync = require('fs');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static assets for previews
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/gif', express.static(path.join(__dirname, 'gif')));

// Serve the React/Vite Dashboard
app.use(express.static(path.join(__dirname, 'frontend/dist')));

// Configure Multer for Credentials Upload
const credentialsStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, __dirname);
    },
    filename: function (req, file, cb) {
        if (file.originalname === 'credentials.json' || file.originalname === 'token.json') {
            cb(null, file.originalname);
        } else {
            cb(new Error("Invalid filename. Only credentials.json or token.json allowed."));
        }
    }
});
const uploadCredentials = multer({ storage: credentialsStorage });

// Configure Multer for Business Card Upload (PNG, JPG, SVG)
const cardStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, 'public');
        if (!fsSync.existsSync(dir)) {
            fsSync.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.svg'].includes(ext)) {
            cb(null, `card${ext}`);
        } else {
            cb(new Error("Invalid format. Please upload PNG, JPG, or SVG."));
        }
    }
});
const uploadCard = multer({ 
    storage: cardStorage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

const CONFIG_FILE = path.join(__dirname, 'config.json');

// Default configuration
const DEFAULT_CONFIG = {
    active: true,
    subjectLine: 'Re: Inquiry & Quick Reply',
    customText: 'How can I help you today? Please leave your message and wait for a reply within 5 minutes.',
    primaryEmail: 'koushalcharn22@gmail.com',
    filterMode: 'personal', // 'personal' or 'all'
    cardFile: 'card.svg'
};

async function readConfig() {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    } catch (err) {
        return DEFAULT_CONFIG;
    }
}

// ── API: Configuration ──
app.get('/api/config', async (req, res) => {
    const config = await readConfig();
    res.json(config);
});

app.post('/api/config', async (req, res) => {
    try {
        const current = await readConfig();
        const updated = { ...current, ...req.body };
        await fs.writeFile(CONFIG_FILE, JSON.stringify(updated, null, 2));
        res.json({ success: true, config: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── API: Credentials Upload ──
app.post('/api/upload-credentials', uploadCredentials.array('credentials', 2), (req, res) => {
    try {
        res.json({ success: true, message: 'Credentials files uploaded successfully.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ── API: Business Card Upload ──
app.post('/api/upload-card', uploadCard.single('businessCard'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file uploaded.' });
        }
        const cardFilename = req.file.filename;
        const current = await readConfig();
        current.cardFile = cardFilename;
        await fs.writeFile(CONFIG_FILE, JSON.stringify(current, null, 2));

        res.json({ 
            success: true, 
            message: 'Business card uploaded successfully!',
            cardFile: cardFilename,
            previewUrl: `/public/${cardFilename}?t=${Date.now()}`
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Helper: Resolve active card attachment
function getActiveCardAttachment(config) {
    const publicDir = path.join(__dirname, 'public');
    const preferredName = config.cardFile || 'card.svg';
    const preferredPath = path.join(publicDir, preferredName);

    if (fsSync.existsSync(preferredPath)) {
        return { filename: preferredName, path: preferredPath, cid: 'card' };
    }

    // Fallback checks
    const candidates = ['card.png', 'card.svg', 'card.jpg', 'card.jpeg'];
    for (const file of candidates) {
        const fullPath = path.join(publicDir, file);
        if (fsSync.existsSync(fullPath)) {
            return { filename: file, path: fullPath, cid: 'card' };
        }
    }
    return null;
}

// Core Email Sender Function
async function sendAutomationEmail({ toEmail, subject, customText, inReplyTo, messageId }) {
    const tokenPath = path.join(__dirname, 'token.json');
    const credPath = path.join(__dirname, 'credentials.json');

    let token, credentials;
    try {
        token = JSON.parse(await fs.readFile(tokenPath, 'utf8'));
        credentials = JSON.parse(await fs.readFile(credPath, 'utf8'));
    } catch (e) {
        throw new Error("Missing credentials.json or token.json. Please upload them in the dashboard.");
    }

    const auth = google.auth.fromJSON(credentials);
    auth.setCredentials(token);
    const gmail = google.gmail({ version: 'v1', auth });
    const config = await readConfig();

    const logoPath = path.join(__dirname, 'gif', '3d-logo-spinning.gif');
    const cardAttachment = getActiveCardAttachment(config);

    const attachments = [];
    if (fsSync.existsSync(logoPath)) {
        attachments.push({ filename: '3d-logo-spinning.gif', path: logoPath, cid: 'logo' });
    }
    if (cardAttachment) {
        attachments.push(cardAttachment);
    }

    const htmlBody = `
    <div style="background-color: #000000; padding: 40px 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; text-align: center; color: #FFFFFF; min-height: 100vh;">
        <div style="max-width: 600px; margin: 0 auto; background: #111111; border-radius: 24px; padding: 40px 30px; border: 1px solid #222222; box-shadow: 0 20px 50px rgba(0,0,0,0.8);">
            
            <!-- UPPER LOGO -->
            <div style="margin-bottom: 30px;">
                <img src="cid:logo" alt="Logo" style="max-height: 90px; width: auto;" />
            </div>

            <!-- BUSINESS CARD (PNG / SVG / JPG) -->
            ${cardAttachment ? `
            <div style="margin-bottom: 30px;">
                <img src="cid:card" alt="Business Card" style="max-width: 380px; width: 100%; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);" />
            </div>` : ''}

            <!-- CUSTOM TEXT -->
            <div style="font-size: 16px; line-height: 1.6; color: #E5E7EB; padding: 10px 20px; border-top: 1px solid #222222; margin-top: 20px; padding-top: 25px;">
                <strong>${customText || config.customText}</strong>
            </div>

        </div>
    </div>`;

    const mailOptions = {
        to: toEmail,
        from: 'me',
        subject: subject || config.subjectLine || 'Re: Automatic Reply',
        html: htmlBody,
        inReplyTo: inReplyTo,
        references: messageId,
        attachments: attachments
    };

    const mail = new MailComposer(mailOptions);
    const messageCompiled = await mail.compile().build();
    const rawMessage = messageCompiled.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const res = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: rawMessage, threadId: messageId ? undefined : undefined }
    });

    return res.data;
}

// ── API: Send Live Test Email ──
app.post('/api/send-test', async (req, res) => {
    try {
        const config = await readConfig();
        const targetEmail = req.body.toEmail || config.primaryEmail || 'koushalcharn22@gmail.com';
        
        console.log(`🚀 Sending live test email to: ${targetEmail}`);
        await sendAutomationEmail({
            toEmail: targetEmail,
            subject: `[TEST AUTO-REPLY] ${config.subjectLine || 'SCP Automation Live Verification'}`,
            customText: config.customText
        });

        res.json({ 
            success: true, 
            message: `Live test email successfully delivered to ${targetEmail}!` 
        });
    } catch (err) {
        console.error('Test email error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── API: Global Status State ──
let engineStatus = {
    isRunning: false,
    lastChecked: null,
    error: null,
    messagesProcessed: 0
};

app.get('/api/status', async (req, res) => {
    const config = await readConfig();
    const cardAttachment = getActiveCardAttachment(config);
    res.json({
        ...engineStatus,
        activeCard: cardAttachment ? cardAttachment.filename : 'None',
        botActive: config.active,
        filterMode: config.filterMode
    });
});

// ── Background Failproof Polling Engine ──
setInterval(async () => {
    try {
        const config = await readConfig();

        if (!config.active) {
            engineStatus.isRunning = false;
            engineStatus.error = "Bot is paused in dashboard.";
            return;
        }

        const tokenPath = path.join(__dirname, 'token.json');
        const credPath = path.join(__dirname, 'credentials.json');
        
        let token, credentials;
        try {
            token = JSON.parse(await fs.readFile(tokenPath, 'utf8'));
            credentials = JSON.parse(await fs.readFile(credPath, 'utf8'));
        } catch (e) {
            engineStatus.isRunning = false;
            engineStatus.error = "Missing credentials.json or token.json.";
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

        console.log(`📬 Found ${messages.length} unread message(s) to process...`);

        for (const msg of messages) {
            const message = await gmail.users.messages.get({ userId: 'me', id: msg.id });
            const headers = message.data.payload.headers;
            const fromHeader = headers.find(h => h.name === 'From');
            const subjectHeader = headers.find(h => h.name === 'Subject');
            const messageIdHeader = headers.find(h => h.name === 'Message-ID');

            const fromMatch = fromHeader ? fromHeader.value.match(/<([^>]+)>/) : null;
            const fromEmail = fromMatch ? fromMatch[1] : (fromHeader ? fromHeader.value : '');
            const originalSubject = subjectHeader ? subjectHeader.value : '';
            const messageId = messageIdHeader ? messageIdHeader.value : '';

            // Filter logic
            if (config.filterMode === 'personal') {
                const isBusinessOrOther = /@(?!gmail\.com|yahoo\.com|outlook\.com|hotmail\.com|aol\.com|icloud\.com|live\.com|msn\.com|me\.com)[^\s@]+\.[^\s@]+/.test(fromEmail);
                if (isBusinessOrOther || fromEmail.includes('noreply') || fromEmail.includes('no-reply')) {
                    console.log(`⏭️ Skipping automated/business sender: ${fromEmail}`);
                    await gmail.users.messages.modify({ userId: 'me', id: msg.id, requestBody: { removeLabelIds: ['UNREAD'] }});
                    continue;
                }
            }

            console.log(`✉️ Auto-replying to: ${fromEmail}`);

            let replySubject = config.subjectLine;
            if (!replySubject) {
                replySubject = originalSubject.toLowerCase().startsWith('re:') ? originalSubject : `Re: ${originalSubject || 'Your message'}`;
            }

            await sendAutomationEmail({
                toEmail: fromEmail,
                subject: replySubject,
                customText: config.customText,
                inReplyTo: messageId,
                messageId: messageId
            });
            
            await gmail.users.messages.modify({ userId: 'me', id: msg.id, requestBody: { removeLabelIds: ['UNREAD'] }});
            engineStatus.messagesProcessed++;
        }
    } catch (error) {
        console.error('Error polling Gmail:', error.message);
        engineStatus.isRunning = false;
        engineStatus.error = error.message;
    }
}, 30000); // Polls every 30 seconds

// Catch-all route to serve Dashboard
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 SCP Automation Server online at http://localhost:${PORT}`);
});
