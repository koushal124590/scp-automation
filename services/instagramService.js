const axios = require('axios');

// Webhook Verification (required by Meta when setting up the webhook)
function verifyWebhook(req, res) {
    const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
    
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
}

// Process incoming Instagram messages
async function handleIncomingMessage(req, res) {
    let body = req.body;

    if (body.object === 'instagram') {
        if (body.entry && body.entry[0].messaging) {
            let webhook_event = body.entry[0].messaging[0];
            let sender_psid = webhook_event.sender.id;

            if (webhook_event.message && !webhook_event.message.is_echo) {
                console.log(`Received IG message from ${sender_psid}: ${webhook_event.message.text}`);
                
                await sendInstagramReply(sender_psid);
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
}

// Send the reply back to the user
async function sendInstagramReply(sender_psid) {
    const PAGE_ACCESS_TOKEN = process.env.IG_PAGE_ACCESS_TOKEN;
    const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';

    const replyText = `Hello! You are messaging SCP (Secure, Contain, Protect).\n\nHow can I help you today?\n\nView my digital business card here: ${PUBLIC_URL}/`;

    try {
        await axios.post(
            `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
            {
                recipient: { id: sender_psid },
                message: { text: replyText }
            }
        );
        console.log('Successfully sent IG reply!');
    } catch (error) {
        console.error('Error sending IG reply:', error.response ? error.response.data : error.message);
    }
}

module.exports = {
    verifyWebhook,
    handleIncomingMessage
};
