const twilio = require('twilio');
const asciiCard = require('../templates/asciiCard');

// This handles incoming SMS Webhooks from Twilio
function handleIncomingSMS(req, res) {
    const incomingMessage = req.body.Body;
    const sender = req.body.From;

    console.log(`Received SMS from ${sender}: ${incomingMessage}`);

    const twiml = new twilio.twiml.MessagingResponse();
    
    // Reply with the ASCII Card
    twiml.message(asciiCard);

    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml.toString());
}

module.exports = {
    handleIncomingSMS
};
