module.exports = function getEmailHtml(logoCid, cardCid) {
    return `
    <div style="background-color: #000000; padding: 20px; width: 100%; min-height: 100vh;">
        
        <!-- UPPER NAV (GIF) -->
        <div style="text-align: center; padding: 15px;">
            <img src="${logoCid}" alt="Nav Logo" style="max-height: 80px;" />
        </div>

        <br><br>

        <!-- MIDDLE BUSINESS CARD (Direct SVG) -->
        <div style="text-align: center;">
            <img src="${cardCid}" alt="SCP Business Card" style="max-width: 320px;" />
        </div>

        <br><br>

        <!-- BELOW TEXT -->
        <div style="text-align: center; padding: 20px; color: #ffffff; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 15px; letter-spacing: 0.5px;">
            How can I help you today? Please leave your message and wait for a reply within 5 minutes.
        </div>

    </div>
    `;
};