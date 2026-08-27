const fs = require('fs');
const potrace = require('potrace');

const tempFile = 'C:\\projects\\automation_tool\\frontend\\public\\scp-logo-exact.png';

// Trace the PNG
potrace.trace(tempFile, { color: '#000000', threshold: 128 }, (err, svg) => {
    if (err) throw err;
    
    // Save the resulting SVG to frontend/public
    fs.writeFileSync('../frontend/public/scp-logo-traced2.svg', svg);
    console.log('Traced SVG successfully written to frontend/public/scp-logo-traced2.svg');
});
