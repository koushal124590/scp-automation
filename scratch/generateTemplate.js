const fs = require('fs');

try {
    let html = fs.readFileSync('C:\\Users\\koush\\Downloads\\card_1.html', 'utf-8');

    // Replace the base64 png with the cardCid variable
    html = html.replace(/src="data:image\/png;base64,[^"]+"/, 'src="${cardCid}"');

    // Add the animated GIF logo and context text right inside the page container
    const headerHtml = `
    <div style="text-align:center; padding: 20px; background-color: #000;">
        <img src="\${logoCid}" alt="Logo" style="max-width: 150px;" />
        <p style="color:white; font-family:sans-serif; margin-top: 10px;">How can I help you today? Please leave your message and wait for a reply within 5 minutes.</p>
    </div>
    `;
    
    html = html.replace('<div id="page-container">', '<div id="page-container">' + headerHtml);

    // Escape backticks in the HTML just in case
    html = html.replace(/`/g, '\\`');

    const moduleContent = `module.exports = function getEmailHtml(logoCid, cardCid) {\n    return \`${html}\`;\n};`;

    fs.writeFileSync('C:\\projects\\automation_tool\\templates\\emailTemplate.js', moduleContent);
    console.log("Template generated successfully.");
} catch (err) {
    console.error(err);
}
