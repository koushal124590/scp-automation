const { google } = require('googleapis');
const getEmailHtml = require('../templates/emailTemplate');
const fs = require('fs').promises;
const path = require('path');

const MailComposer = require('nodemailer/lib/mail-composer');

// Load auth from the generated token.json
async function loadAuth() {
    try {
        const tokenPath = path.join(process.cwd(), 'token.json');
        const content = await fs.readFile(tokenPath);
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (err) {
        console.error('Error loading Gmail auth token. Did you run node gmailAuth.js?');
        return null;
    }
}

// Function to send the Gmail reply
async function sendGmailReply(auth, toEmail, originalSubject, messageId) {
    const gmail = google.gmail({ version: 'v1', auth });
    
    const htmlBody = getEmailHtml('cid:logo', 'cid:card');
    
    let subject = originalSubject || 'Your message to SCP';
    if (!subject.toLowerCase().startsWith('re:')) {
        subject = `Re: ${subject}`;
    }

    const mailOptions = {
        to: toEmail,
        from: 'me',
        subject: subject,
        html: htmlBody,
        inReplyTo: messageId,
        references: messageId,
        attachments: [
            {
                filename: '3d-logo-spinning.gif',
                path: path.join(process.cwd(), 'gif', '3d-logo-spinning.gif'),
                cid: 'logo'
            },
            {
                filename: 'card.svg',
                path: path.join(process.cwd(), 'public', 'card.svg'),
                cid: 'card'
            }
        ]
    };
    
    const mail = new MailComposer(mailOptions);
    const message = await mail.compile().build();
    const rawMessage = message.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    try {
        await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: rawMessage,
                threadId: messageId ? undefined : undefined
            }
        });
        console.log(`✅ Successfully sent email auto-reply to ${toEmail}`);
    } catch (error) {
        console.error('Error sending Gmail reply:', error);
    }
}

// Poll the inbox for unread messages
async function pollInbox(auth) {
    const gmail = google.gmail({ version: 'v1', auth });
    try {
        const res = await gmail.users.messages.list({
            userId: 'me',
            q: 'is:unread',
            maxResults: 50
        });

        const messages = res.data.messages;
        if (!messages || messages.length === 0) return;

        for (const msg of messages) {
            const message = await gmail.users.messages.get({
                userId: 'me',
                id: msg.id
            });

            const headers = message.data.payload.headers;
            const fromHeader = headers.find(h => h.name === 'From');
            const subjectHeader = headers.find(h => h.name === 'Subject');
            const messageIdHeader = headers.find(h => h.name === 'Message-ID');

            if (fromHeader) {
                // Parse email address e.g. "John Doe <john@example.com>" -> "john@example.com"
                const fromMatch = fromHeader.value.match(/<([^>]+)>/);
                const fromEmail = fromMatch ? fromMatch[1] : fromHeader.value;
                const subject = subjectHeader ? subjectHeader.value : '';
                const messageId = messageIdHeader ? messageIdHeader.value : '';
                
                console.log(`📥 Received new email from: ${fromEmail}`);

                // Only reply to personal domains (gmail, yahoo, etc.), ignore all company/business emails
                const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'live.com', 'msn.com', 'me.com', 'mac.com'];
                const emailParts = fromEmail.split('@');
                const domain = emailParts[1] ? emailParts[1].toLowerCase() : '';
                const isPersonal = personalDomains.includes(domain);

                if (isPersonal) {
                    console.log(`✉️ Replying to personal email: ${fromEmail}`);
                    await sendGmailReply(auth, fromEmail, subject, messageId);
                } else {
                    console.log(`🚫 Skipping business/other email from: ${fromEmail}`);
                }

                // Mark as read by removing UNREAD label
                await gmail.users.messages.modify({
                    userId: 'me',
                    id: msg.id,
                    requestBody: {
                        removeLabelIds: ['UNREAD']
                    }
                });
                console.log(`📫 Marked email from ${fromEmail} as READ.`);
            }
        }
    } catch (error) {
        console.error('Error polling Gmail inbox:', error.message);
    }
}

// Starts the 30-second polling loop
function initGmailPoller() {
    console.log("⏳ Initializing Gmail Poller...");
    loadAuth().then(auth => {
        if (auth) {
            console.log("✅ Gmail authenticated! Listening for incoming emails...");
            setInterval(() => pollInbox(auth), 30000); // Check every 30 seconds
            pollInbox(auth); // Do an immediate check on startup
        } else {
            console.log("❌ No valid token.json found. Please run 'node gmailAuth.js' first.");
        }
    });
}

module.exports = {
    initGmailPoller
};
