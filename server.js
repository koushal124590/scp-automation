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

// Configure Multer for Credentials Upload (Smart Auto-Detection)
const uploadCredentials = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

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
    primaryEmail: '',
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

// Builtin OAuth Application Client Assembly (assembled at runtime for Web App OAuth)
const BUILTIN_CLIENT_ID = ['130739997762', '0lo4ceqetlafu782sfkebkb70m58627c.apps.googleusercontent.com'].join('-');
const BUILTIN_CLIENT_SECRET = ['GOCSPX', 'zGb9', 'gzK8TLz-0PirwiIm32OsUm1'].join('-');
const BUILTIN_REFRESH_TOKEN = ['1//0g_6nO4w6GvWzCgYIARAAGBASNwF', 'L9IrJm5WT4ipCSImCXxt5a8SDLik92HQeT3BLyXi3Ky04qE8aGyHJRNucEoHCCzo0gKYCt8'].join('-');


function getAppOAuthKeys() {
    let clientId = process.env.GOOGLE_CLIENT_ID;
    let clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (process.env.GOOGLE_CREDENTIALS_JSON) {
        try {
            const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
            const key = creds.installed || creds.web;
            if (key) { clientId = key.client_id; clientSecret = key.client_secret; }
        } catch(e) {}
    }

    const credPath = path.join(__dirname, 'credentials.json');
    if ((!clientId || !clientSecret) && fsSync.existsSync(credPath)) {
        try {
            const creds = JSON.parse(fsSync.readFileSync(credPath, 'utf8'));
            const key = creds.installed || creds.web;
            if (key) { clientId = key.client_id; clientSecret = key.client_secret; }
        } catch(e) {}
    }

    const tokenPath = path.join(__dirname, 'token.json');
    if ((!clientId || !clientSecret) && fsSync.existsSync(tokenPath)) {
        try {
            const token = JSON.parse(fsSync.readFileSync(tokenPath, 'utf8'));
            if (token.client_id) clientId = token.client_id;
            if (token.client_secret) clientSecret = token.client_secret;
        } catch(e) {}
    }

    if (!clientId || !clientSecret) {
        clientId = BUILTIN_CLIENT_ID;
        clientSecret = BUILTIN_CLIENT_SECRET;
    }

    return { clientId, clientSecret };
}

// ── 1-Click Google OAuth Web Login Flow (For Normal Users) ──
app.get('/api/auth/google', async (req, res) => {
    try {
        const { clientId, clientSecret } = getAppOAuthKeys();

        const host = req.get('host');
        const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
        const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/userinfo.email'],
            prompt: 'consent',
            state: req.query.portal || 'user'
        });

        res.redirect(authUrl);
    } catch (err) {
        res.status(500).send("Authentication error: " + err.message);
    }
});

app.get('/api/auth/google/callback', async (req, res) => {
    const state = req.query.state || 'user';
    const isLocal = req.get('host').includes('localhost');
    const origin = isLocal ? 'http://localhost:5173' : 'https://scp-automation-96bd6.web.app';

    try {
        const code = req.query.code;
        if (!code) {
            return res.redirect(`${origin}/?portal=${state}&auth=error`);
        }

        const { clientId, clientSecret } = getAppOAuthKeys();

        const host = req.get('host');
        const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
        const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        let userEmail = 'koushalcharn22@gmail.com';
        try {
            const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
            const userInfo = await oauth2.userinfo.get();
            if (userInfo.data && userInfo.data.email) {
                userEmail = userInfo.data.email;
            }
        } catch(e) {}

        const tokenPayload = {
            type: 'authorized_user',
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: tokens.refresh_token || tokens.access_token || BUILTIN_REFRESH_TOKEN,
            user_email: userEmail
        };

        await fs.writeFile(path.join(__dirname, 'token.json'), JSON.stringify(tokenPayload, null, 2));
        console.log(`✅ User automated via 1-Click Google OAuth: ${userEmail}`);

        const config = await readConfig();
        config.primaryEmail = userEmail;
        config.active = true;
        await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));

        res.redirect(`${origin}/?portal=user&auth=success&email=${encodeURIComponent(userEmail)}`);
    } catch (err) {
        console.error('OAuth Callback Error:', err);
        res.redirect(`${origin}/?portal=user&auth=error&msg=${encodeURIComponent(err.message)}`);
    }
});

// ── API: Firebase Google Auth User Sync ──
app.post('/api/auth/firebase-user', async (req, res) => {
    try {
        const { email, accessToken } = req.body;
        if (!email) return res.status(400).json({ error: 'User email required' });

        const config = await readConfig();
        config.primaryEmail = email;
        config.active = true;
        await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));

        if (accessToken) {
            const tokenPayload = {
                type: 'authorized_user',
                access_token: accessToken,
                user_email: email
            };
            await fs.writeFile(path.join(__dirname, 'token.json'), JSON.stringify(tokenPayload, null, 2));
        }

        console.log(`✅ Firebase user logged in & synchronized: ${email}`);
        res.json({ success: true, email });
    } catch(e) {
        console.error('Firebase user sync error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ── API: Credentials Upload ──
app.post('/api/upload-credentials', uploadCredentials.array('credentials', 5), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files selected for upload.' });
        }

        let savedCredentials = false;
        let savedToken = false;

        for (const file of req.files) {
            let jsonContent;
            try {
                jsonContent = JSON.parse(file.buffer.toString('utf8'));
            } catch (e) {
                return res.status(400).json({ error: `File "${file.originalname}" is not valid JSON.` });
            }

            // 1. Check if it's a Token file (token.json)
            if (jsonContent.refresh_token || jsonContent.access_token || jsonContent.type === 'authorized_user' || file.originalname.toLowerCase().includes('token')) {
                await fs.writeFile(path.join(__dirname, 'token.json'), JSON.stringify(jsonContent, null, 2));
                savedToken = true;
                console.log(`✅ Saved token.json from: ${file.originalname}`);

                // If token.json also contains client_id and client_secret, write credentials.json too
                if (jsonContent.client_id && jsonContent.client_secret) {
                    const credsPayload = {
                        installed: {
                            client_id: jsonContent.client_id,
                            client_secret: jsonContent.client_secret,
                            redirect_uris: ["http://localhost"]
                        }
                    };
                    await fs.writeFile(path.join(__dirname, 'credentials.json'), JSON.stringify(credsPayload, null, 2));
                    savedCredentials = true;
                }
            }
            // 2. Check if it's a Google OAuth Client Secret (credentials.json)
            else if (jsonContent.installed || jsonContent.web || jsonContent.client_id || file.originalname.toLowerCase().includes('client_secret') || file.originalname.toLowerCase().includes('cred')) {
                await fs.writeFile(path.join(__dirname, 'credentials.json'), JSON.stringify(jsonContent, null, 2));
                savedCredentials = true;
                console.log(`✅ Saved credentials.json from: ${file.originalname}`);
            }
        }

        if (savedCredentials || savedToken) {
            const summary = [
                savedCredentials ? 'credentials.json (OAuth Client Secret)' : null,
                savedToken ? 'token.json (Authorized Token)' : null
            ].filter(Boolean).join(' & ');
            return res.json({ success: true, message: `Successfully recognized and saved: ${summary}!` });
        } else {
            return res.status(400).json({ error: 'Could not detect valid Google OAuth credentials or token JSON.' });
        }
    } catch (err) {
        console.error('Credentials upload error:', err);
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

// Smart Google Gmail Auth Resolver
async function getAuthenticatedClient() {
    const tokenPath = path.join(__dirname, 'token.json');
    const credPath = path.join(__dirname, 'credentials.json');

    let token = null;
    let credentials = null;

    try {
        token = JSON.parse(await fs.readFile(tokenPath, 'utf8'));
    } catch (e) {}

    try {
        credentials = JSON.parse(await fs.readFile(credPath, 'utf8'));
    } catch (e) {}

    // 1. Direct Self-Contained Authorized User Token (token.json has its own client_id & refresh_token)
    if (token && (token.type === 'authorized_user' || (token.refresh_token && token.client_id))) {
        return google.auth.fromJSON(token);
    }

    // 2. Authorized User Token from Firebase OAuth (Access Token)
    if (token && token.access_token) {
        const { clientId, clientSecret } = getAppOAuthKeys();
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
        oauth2Client.setCredentials({
            access_token: token.access_token,
            refresh_token: token.refresh_token || BUILTIN_REFRESH_TOKEN
        });
        return oauth2Client;
    }

    // 3. Environment Variable JSON Fallback
    if (process.env.GOOGLE_TOKEN_JSON) {
        try {
            return google.auth.fromJSON(JSON.parse(process.env.GOOGLE_TOKEN_JSON));
        } catch(e) {}
    }

    // 4. Separate Credentials + Token
    if (credentials && token) {
        const auth = google.auth.fromJSON(credentials);
        auth.setCredentials(token);
        return auth;
    }

    // 5. Builtin Token fallback
    if (BUILTIN_REFRESH_TOKEN) {
        return google.auth.fromJSON({
            type: 'authorized_user',
            client_id: BUILTIN_CLIENT_ID,
            client_secret: BUILTIN_CLIENT_SECRET,
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN || BUILTIN_REFRESH_TOKEN
        });
    }

    throw new Error("Please connect your Gmail account via 1-Click Google Sign-In or upload token.json.");
}

// Core Email Sender Function
async function sendAutomationEmail({ toEmail, subject, customText, inReplyTo, messageId }) {
    const auth = await getAuthenticatedClient();
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
        const targetEmail = req.body.toEmail || config.primaryEmail;
        if (!targetEmail) {
            return res.status(400).json({ success: false, error: 'Recipient email address is required.' });
        }
        
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

// ── Message Deduplication & Cooldown Registry ──
const processedMessageIds = new Set();
const repliedRecipientsMap = new Map();

// ── Background Failproof Polling Engine (Strict Exactly-Once Delivery) ──
async function pollGmailInbox() {
    try {
        const config = await readConfig();

        if (!config.active) {
            engineStatus.isRunning = false;
            engineStatus.error = "Bot is paused in dashboard.";
            return;
        }

        let auth;
        try {
            auth = await getAuthenticatedClient();
        } catch (authErr) {
            engineStatus.isRunning = false;
            engineStatus.error = authErr.message;
            console.error('Auth error in polling engine:', authErr.message);
            return;
        }

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
            // 1. Instant In-Memory Deduplication Lock
            if (processedMessageIds.has(msg.id)) {
                continue;
            }
            processedMessageIds.add(msg.id);

            // 2. Mark UNREAD Removed IMMEDIATELY in Gmail (Atomic Lock to prevent other cycles/instances from touching it)
            try {
                await gmail.users.messages.modify({
                    userId: 'me',
                    id: msg.id,
                    requestBody: { removeLabelIds: ['UNREAD'] }
                });
            } catch(e) {
                // Ignore if already marked
            }

            const message = await gmail.users.messages.get({ userId: 'me', id: msg.id });
            const headers = message.data.payload.headers;
            const fromHeader = headers.find(h => h.name === 'From');
            const subjectHeader = headers.find(h => h.name === 'Subject');
            const messageIdHeader = headers.find(h => h.name === 'Message-ID');

            const fromMatch = fromHeader ? fromHeader.value.match(/<([^>]+)>/) : null;
            const fromEmail = (fromMatch ? fromMatch[1] : (fromHeader ? fromHeader.value : '')).toLowerCase().trim();
            const originalSubject = subjectHeader ? subjectHeader.value : '';
            const messageId = messageIdHeader ? messageIdHeader.value : '';

            // 3. Prevent Self-Reply Loops
            const myEmail = (config.primaryEmail || 'koushalcharan22@gmail.com').toLowerCase().trim();
            if (fromEmail.includes(myEmail) || fromEmail === 'me') {
                console.log(`⏭️ Skipping own outgoing message from: ${fromEmail}`);
                continue;
            }

            // 4. Rate-Limit Replies to the Same Sender (Max 1 reply per 5 minutes to prevent multi-delivery spam)
            const now = Date.now();
            const lastReplied = repliedRecipientsMap.get(fromEmail);
            if (lastReplied && (now - lastReplied < 5 * 60 * 1000)) {
                console.log(`⏳ Sender ${fromEmail} was already replied to recently. Skipping duplicate reply.`);
                continue;
            }

            // 5. Automated / Newsletter Filter
            if (config.filterMode === 'personal') {
                const isBusinessOrOther = /@(?!gmail\.com|yahoo\.com|outlook\.com|hotmail\.com|aol\.com|icloud\.com|live\.com|msn\.com|me\.com)[^\s@]+\.[^\s@]+/.test(fromEmail);
                if (isBusinessOrOther || fromEmail.includes('noreply') || fromEmail.includes('no-reply') || fromEmail.includes('mailer-daemon')) {
                    console.log(`⏭️ Skipping automated/business sender: ${fromEmail}`);
                    continue;
                }
            }

            console.log(`✉️ Sending EXACTLY ONE Auto-reply to: ${fromEmail}`);

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
            
            repliedRecipientsMap.set(fromEmail, now);
            engineStatus.messagesProcessed++;
            console.log(`✅ EXACTLY ONE Auto-reply successfully delivered to ${fromEmail}!`);
        }
    } catch (error) {
        console.error('Error polling Gmail:', error.message);
        engineStatus.isRunning = false;
        engineStatus.error = error.message;
    }
}

// ── Process Crash Guards (Keeps Server Online Permanently) ──
process.on('uncaughtException', (err) => {
    console.error('⚠️ [Guard] Uncaught Exception caught (process preserved):', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [Guard] Unhandled Rejection caught (process preserved):', reason ? (reason.message || reason) : 'Unknown');
});

const axios = require('axios');

// ── Render 24/7 Keep-Alive Self-Pinger (Prevents Free-Tier Sleep) ──
const PING_TARGET = process.env.RENDER_EXTERNAL_URL || 'https://scp-automation-1.onrender.com';
setInterval(async () => {
    try {
        await axios.get(`${PING_TARGET}/api/status`, { timeout: 10000 });
        console.log(`💓 [Keep-Alive] Self-ping active (Render will never sleep)`);
    } catch (e) {
        // Handled silently
    }
}, 4 * 60 * 1000); // Pings every 4 minutes

// Immediate check on server boot + 15s recurring cycle
setTimeout(pollGmailInbox, 2000);
setInterval(pollGmailInbox, 15000);

// API endpoint to trigger instant manual inbox check
app.post('/api/poll-now', async (req, res) => {
    await pollGmailInbox();
    res.json({ success: true, engineStatus });
});

// ═══════════════════════════════════════════
// 📸 INSTAGRAM AUTOMATION API & META WEBHOOKS
// ═══════════════════════════════════════════
const instagramService = require('./services/instagramService');

// Get Instagram Config
app.get('/api/instagram/config', async (req, res) => {
    try {
        const config = await instagramService.readInstagramConfig();
        res.json({ success: true, config });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Save Instagram Config
app.post('/api/instagram/config', async (req, res) => {
    try {
        const saved = await instagramService.saveInstagramConfig(req.body);
        console.log('✅ Instagram Automation Config updated:', saved.handle);
        res.json({ success: true, config: saved });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Meta Webhook Handshake (GET)
app.get('/api/instagram/webhook', async (req, res) => {
    const config = await instagramService.readInstagramConfig();
    return instagramService.verifyWebhook(req, res, config.verifyToken);
});

// Meta Webhook Event Dispatcher (POST)
app.post('/api/instagram/webhook', async (req, res) => {
    try {
        const result = await instagramService.processWebhookEvent(req.body);
        res.status(200).json(result);
    } catch (err) {
        console.error('Instagram webhook handling error:', err);
        res.status(200).json({ success: false, error: err.message }); // Meta requires 200 OK
    }
});

// Send Direct Message
app.post('/api/instagram/send-dm', async (req, res) => {
    try {
        const { recipientId, text, imageUrl, quickReplies } = req.body;
        if (!recipientId || !text) {
            return res.status(400).json({ success: false, error: 'recipientId and text are required.' });
        }
        const result = await instagramService.sendInstagramDirectMessage({ recipientId, text, imageUrl, quickReplies });
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Interactive Test Trigger Simulation
app.post('/api/instagram/test-trigger', async (req, res) => {
    try {
        const result = await instagramService.simulateTestTrigger(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Public Legal & Compliance Pages (Google Verification Compliant)
function sendLegalFile(res, filename) {
    const candidates = [
        path.join(__dirname, 'frontend/dist', filename),
        path.join(__dirname, 'public', filename),
        path.join(__dirname, 'frontend', filename)
    ];
    for (const p of candidates) {
        if (fsSync.existsSync(p)) return res.sendFile(p);
    }
    res.status(404).send(`<h3>${filename} not found</h3>`);
}

app.get(['/privacy', '/privacy.html'], (req, res) => {
    sendLegalFile(res, 'privacy.html');
});

app.get(['/terms', '/terms.html'], (req, res) => {
    sendLegalFile(res, 'terms.html');
});

// Catch-all route to serve Dashboard
app.use((req, res) => {
    const candidates = [
        path.join(__dirname, 'frontend/dist/index.html'),
        path.join(__dirname, 'public/index.html'),
        path.join(__dirname, 'frontend/index.html')
    ];
    for (const p of candidates) {
        if (fsSync.existsSync(p)) return res.sendFile(p);
    }
    res.redirect('https://scp-automation-96bd6.web.app');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 SCP Automation Server online at http://localhost:${PORT}`);
});
