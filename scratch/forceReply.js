const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const getEmailHtml = require('../templates/emailTemplate');
const MailComposer = require('nodemailer/lib/mail-composer');

async function forceReply() {
    const tokenPath = path.join(process.cwd(), 'token.json');
    const content = await fs.readFile(tokenPath);
    const credentials = JSON.parse(content);
    const auth = google.auth.fromJSON(credentials);
    const gmail = google.gmail({ version: 'v1', auth });

    const res = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread from:koushal',
        maxResults: 10
    });

    const messages = res.data.messages;
    if (!messages || messages.length === 0) {
        console.log("No unread emails from koushal found.");
        return;
    }

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

        console.log(`Force replying to: ${fromEmail}`);

        const htmlBody = getEmailHtml('cid:logo', 'cid:card');
        let repSubject = subject || 'Your message to SCP';
        if (!repSubject.toLowerCase().startsWith('re:')) {
            repSubject = `Re: ${repSubject}`;
        }

        const mailOptions = {
            to: fromEmail,
            from: 'me',
            subject: repSubject,
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
        const messageCompiled = await mail.compile().build();
        const rawMessage = messageCompiled.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: rawMessage,
                threadId: messageId ? undefined : undefined
            }
        });
        
        await gmail.users.messages.modify({
            userId: 'me',
            id: msg.id,
            requestBody: {
                removeLabelIds: ['UNREAD']
            }
        });
        console.log(`✅ Successfully forced auto-reply to ${fromEmail}`);
    }
}
forceReply().catch(console.error);
