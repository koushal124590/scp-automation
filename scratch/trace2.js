const fs = require('fs');
const potrace = require('potrace');

const tempFile = 'C:\\Users\\koush\\.gemini\\antigravity-ide\\brain\\adae1cda-71bc-4b0c-9531-5a23dae7e2e9\\.user_uploaded\\media_1787671571120.png';

// Trace the PNG
potrace.trace(tempFile, { color: '#000000', threshold: 128 }, (err, svg) => {
    if (err) throw err;
    
    // Save the resulting SVG to frontend/public
    fs.writeFileSync('../frontend/public/scp-logo.svg', svg);
    console.log('Traced SVG successfully written to frontend/public/scp-logo.svg');
});
