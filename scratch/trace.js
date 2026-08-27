const fs = require('fs');
const https = require('https');
const potrace = require('potrace');

const url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/SCP_Foundation_%28emblem%29.svg/512px-SCP_Foundation_%28emblem%29.svg.png';
const tempFile = 'scp-temp.png';

https.get(url, (res) => {
    const file = fs.createWriteStream(tempFile);
    res.pipe(file);
    file.on('finish', () => {
        file.close();
        
        // Trace the PNG
        potrace.trace(tempFile, { color: '#000000', threshold: 128 }, (err, svg) => {
            if (err) throw err;
            
            // Save the resulting SVG to frontend/public
            fs.writeFileSync('../frontend/public/scp-logo-traced.svg', svg);
            console.log('Traced SVG successfully written to frontend/public/scp-logo-traced.svg');
        });
    });
});
