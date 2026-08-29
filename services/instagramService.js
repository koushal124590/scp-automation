const axios = require('axios');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const IG_CONFIG_FILE = path.join(__dirname, '..', 'instagram_config.json');

const DEFAULT_IG_CONFIG = {
    active: true,
    handle: 'koushal_charan',
    pageAccessToken: process.env.INSTAGRAM_PAGE_ACCESS_TOKEN || '',
    verifyToken: process.env.INSTAGRAM_VERIFY_TOKEN || 'scp_instagram_secret_2026',
    storyAutoReply: true,
    storyText: 'Thanks for mentioning me in your story! 🚀 Here is my direct digital business card and contact details.',
    keywordAutoReply: true,
    keywords: {
        'price': 'Here are our pricing plans and project estimation details. Let us know what you need built!',
        'card': 'Here is my official SCP AIML Engineer business card with direct line and email.',
        'info': 'SCP Automation is an AI-powered 24/7 auto-responder system for Gmail and Instagram.',
        'demo': 'You can explore our live platform and features at https://scp-automation-96bd6.web.app/'
    },
    defaultText: 'Hey there! Thanks for reaching out. Here is my digital contact card and portfolio line:',
    reelCommentAutoDm: true,
    reelText: 'Sent you the full information in your DMs! Check your requests 📥',
    cardFile: 'card.svg',
    stats: {
        messagesReceived: 14,
        repliesSent: 14,
        storyMentions: 6,
        reelComments: 8,
        lastActive: new Date().toISOString()
    }
};

async function readInstagramConfig() {
    try {
        const data = await fs.readFile(IG_CONFIG_FILE, 'utf8');
        return { ...DEFAULT_IG_CONFIG, ...JSON.parse(data) };
    } catch (err) {
        return DEFAULT_IG_CONFIG;
    }
}

async function saveInstagramConfig(newConfig) {
    const current = await readInstagramConfig();
    const merged = { 
        ...current, 
        ...newConfig,
        stats: { ...current.stats, ...(newConfig.stats || {}) }
    };
    await fs.writeFile(IG_CONFIG_FILE, JSON.stringify(merged, null, 2));
    return merged;
}

// ── Meta Webhook Handshake Verification (GET) ──
function verifyWebhook(req, res, verifyToken) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === verifyToken) {
        console.log('✅ Instagram Meta Webhook Verified successfully!');
        return res.status(200).send(challenge);
    } else {
        console.warn('❌ Instagram Meta Webhook verification failed.');
        return res.sendStatus(403);
    }
}

// ── Send Instagram Direct Message via Graph API ──
async function sendInstagramDirectMessage({ recipientId, text, imageUrl, quickReplies = [] }) {
    const config = await readInstagramConfig();

    if (!config.active) {
        console.log('⚠️ Instagram bot is paused in settings.');
        return { success: false, error: 'Instagram automation paused' };
    }

    const payload = {
        recipient: { id: recipientId },
        message: {
            text: text
        }
    };

    if (quickReplies && quickReplies.length > 0) {
        payload.message.quick_replies = quickReplies.map(qr => ({
            content_type: 'text',
            title: qr.title,
            payload: qr.payload || qr.title
        }));
    }

    // Call Meta Graph API if access token configured
    if (config.pageAccessToken) {
        try {
            const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${config.pageAccessToken}`;
            const response = await axios.post(url, payload);
            
            config.stats.repliesSent++;
            config.stats.lastActive = new Date().toISOString();
            await saveInstagramConfig(config);

            return { success: true, metaResponse: response.data };
        } catch (err) {
            console.error('Meta Graph API Send Error:', err.response ? err.response.data : err.message);
            return { success: false, error: err.response ? err.response.data : err.message };
        }
    }

    // Fallback simulation mode
    config.stats.repliesSent++;
    config.stats.lastActive = new Date().toISOString();
    await saveInstagramConfig(config);

    console.log(`📸 [Simulated IG Direct Message] Sent to: ${recipientId} | Message: "${text.substring(0, 40)}..."`);
    return { success: true, simulated: true, recipientId, text, imageUrl };
}

// ── Process Incoming Webhook Event (POST) ──
async function processWebhookEvent(body) {
    const config = await readInstagramConfig();
    if (!config.active) return { success: false, message: 'Bot paused' };

    const entries = body.entry || [];
    const results = [];

    for (const entry of entries) {
        const messaging = entry.messaging || [];
        for (const event of messaging) {
            const senderId = event.sender ? event.sender.id : 'unknown_sender';
            config.stats.messagesReceived++;

            // 1. Story Mention Event
            if (event.message && event.message.attachments) {
                const isStory = event.message.attachments.some(att => att.type === 'story_mention' || att.type === 'share');
                if (isStory && config.storyAutoReply) {
                    config.stats.storyMentions++;
                    console.log(`📸 Story Mention received from IG user: ${senderId}`);
                    const result = await sendInstagramDirectMessage({
                        recipientId: senderId,
                        text: config.storyText,
                        quickReplies: [
                            { title: '📧 Email Developer', payload: 'EMAIL' },
                            { title: '📞 Call Direct', payload: 'CALL' }
                        ]
                    });
                    results.push(result);
                    continue;
                }
            }

            // 2. Direct Message Text Event (Keyword Check)
            if (event.message && event.message.text) {
                const userText = event.message.text.trim().toLowerCase();
                let matchedReply = null;

                if (config.keywordAutoReply && config.keywords) {
                    for (const [kw, reply] of Object.entries(config.keywords)) {
                        if (userText.includes(kw.toLowerCase())) {
                            matchedReply = reply;
                            break;
                        }
                    }
                }

                const replyText = matchedReply || config.defaultText;
                console.log(`💬 Processing IG DM from ${senderId}: "${event.message.text}" -> Replying...`);
                
                const result = await sendInstagramDirectMessage({
                    recipientId: senderId,
                    text: replyText,
                    quickReplies: [
                        { title: '💼 Business Card', payload: 'CARD' },
                        { title: '🚀 Demo Platform', payload: 'DEMO' }
                    ]
                });
                results.push(result);
            }
        }
    }

    await saveInstagramConfig(config);
    return { success: true, processedCount: results.length, results };
}

// ── Test Trigger Event Simulation ──
async function simulateTestTrigger({ eventType, userHandle, messageText }) {
    const config = await readInstagramConfig();
    const handle = userHandle || 'guest_user';
    let replyText = config.defaultText;
    let triggerType = eventType || 'keyword';

    if (triggerType === 'story') {
        replyText = config.storyText;
        config.stats.storyMentions++;
    } else if (triggerType === 'reel') {
        replyText = config.reelText;
        config.stats.reelComments++;
    } else {
        const textLower = (messageText || '').toLowerCase();
        for (const [kw, reply] of Object.entries(config.keywords || {})) {
            if (textLower.includes(kw.toLowerCase())) {
                replyText = reply;
                break;
            }
        }
    }

    config.stats.messagesReceived++;
    config.stats.repliesSent++;
    config.stats.lastActive = new Date().toISOString();
    await saveInstagramConfig(config);

    return {
        success: true,
        triggerType,
        userHandle: `@${handle.replace('@', '')}`,
        inputMessage: messageText || (triggerType === 'story' ? 'Tagged you in a story! 📸' : 'Commented on your reel 🎬'),
        automatedResponse: replyText,
        cardAttachment: '/card.svg',
        quickActions: ['📧 Send Email', '📞 Call Direct', '🌐 Open Portfolio'],
        timestamp: new Date().toLocaleTimeString()
    };
}

module.exports = {
    readInstagramConfig,
    saveInstagramConfig,
    verifyWebhook,
    sendInstagramDirectMessage,
    processWebhookEvent,
    simulateTestTrigger
};
