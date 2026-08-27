const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');

admin.initializeApp();
const db = admin.firestore();

// A simple HTTP endpoint for the frontend to save config if we wanted to avoid direct Firestore SDK usage,
// but usually the frontend talks to Firestore directly if authenticated.
// For now, we will focus on the Scheduler.

exports.pollGmailAccounts = functions.pubsub.schedule('every 1 minutes').onRun(async (context) => {
    console.log('Starting automated Gmail polling for all active users...');
    
    try {
        const usersSnapshot = await db.collection('users').where('automationActive', '==', true).get();
        
        if (usersSnapshot.empty) {
            console.log('No active users found.');
            return null;
        }

        for (const doc of usersSnapshot.docs) {
            const userData = doc.data();
            const { credentials, token, customText, svgUrl, gifUrl } = userData;

            if (!credentials || !token) {
                console.log(`Skipping user ${doc.id}: Missing credentials or token.`);
                continue;
            }

            try {
                // Initialize Google Auth for this user
                const auth = google.auth.fromJSON(credentials);
                auth.setCredentials(token);
                const gmail = google.gmail({ version: 'v1', auth });

                // Poll inbox
                const res = await gmail.users.messages.list({
                    userId: 'me',
                    q: 'is:unread',
                    maxResults: 20
                });

                const messages = res.data.messages;
                if (!messages || messages.length === 0) {
                    console.log(`No unread messages for user ${doc.id}`);
                    continue;
                }

                console.log(`Processing ${messages.length} messages for user ${doc.id}`);

                for (const msg of messages) {
                    const message = await gmail.users.messages.get({
                        userId: 'me',
                        id: msg.id
                    });

                    const headers = message.data.payload.headers;
                    const fromHeader = headers.find(h => h.name === 'From');
                    const subjectHeader = headers.find(h => h.name === 'Subject');
                    const messageIdHeader = headers.find(h => h.name === 'Message-ID');

                    const fromMatch = fromHeader.value.match(/<([^>]+)>/);
                    const fromEmail = fromMatch ? fromMatch[1] : fromHeader.value;
                    const subject = subjectHeader ? subjectHeader.value : '';
                    const messageId = messageIdHeader ? messageIdHeader.value : '';

                    // Simple business/other filter
                    const isBusinessOrOther = /@(?!gmail\.com|yahoo\.com|outlook\.com|hotmail\.com|aol\.com|icloud\.com)[^\s@]+\.[^\s@]+/.test(fromEmail);
                    if (isBusinessOrOther || fromEmail.includes('noreply') || fromEmail.includes('no-reply')) {
                        console.log(`Skipping business/other email from: ${fromEmail}`);
                        await gmail.users.messages.modify({
                            userId: 'me', id: msg.id, requestBody: { removeLabelIds: ['UNREAD'] }
                        });
                        continue;
                    }

                    console.log(`Replying to: ${fromEmail}`);

                    const htmlBody = `
                    <div style="font-family: Arial, sans-serif; text-align: center; max-width: 600px; margin: 0 auto;">
                        <img src="cid:logo" alt="Logo" style="max-width: 150px; margin-bottom: 20px;" />
                        <br/>
                        <img src="cid:card" alt="Business Card" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" />
                        <p style="margin-top: 30px; font-size: 16px; color: #333;">
                            <strong>${customText || 'How can I help you today? Please leave your message and wait for a reply within 5 minutes.'}</strong>
                        </p>
                    </div>`;

                    let repSubject = subject || 'Auto Reply';
                    if (!repSubject.toLowerCase().startsWith('re:')) repSubject = `Re: ${repSubject}`;

                    // Note: In a real environment, the SVG and GIF should be fetched from the Firebase Storage URLs (svgUrl/gifUrl)
                    // and attached. For simplicity here, we assume the frontend provided direct accessible URLs 
                    // or we attach them from local temp files after downloading.
                    
                    const mailOptions = {
                        to: fromEmail,
                        from: 'me',
                        subject: repSubject,
                        html: htmlBody,
                        inReplyTo: messageId,
                        references: messageId,
                        attachments: [
                            { filename: 'logo.gif', path: gifUrl, cid: 'logo' },
                            { filename: 'card.svg', path: svgUrl, cid: 'card' }
                        ]
                    };
                    
                    const mail = new MailComposer(mailOptions);
                    const messageCompiled = await mail.compile().build();
                    const rawMessage = messageCompiled.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

                    await gmail.users.messages.send({
                        userId: 'me',
                        requestBody: { raw: rawMessage, threadId: messageId ? undefined : undefined }
                    });
                    
                    await gmail.users.messages.modify({
                        userId: 'me',
                        id: msg.id,
                        requestBody: { removeLabelIds: ['UNREAD'] }
                    });
                }
            } catch (err) {
                console.error(`Error processing user ${doc.id}:`, err);
            }
        }
    } catch (error) {
        console.error('Error fetching users from Firestore:', error);
    }
    return null;
});
