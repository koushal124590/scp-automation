const fs = require('fs');
const html = fs.readFileSync('C:\\Users\\koush\\Downloads\\card_1.html', 'utf8');
const match = html.match(/src="(data:image\/png;base64,[^"]+)"/);
if (match) {
    const base64Data = match[1].replace(/^data:image\/png;base64,/, "");
    fs.writeFileSync('C:\\projects\\automation_tool\\public\\card_1.png', base64Data, 'base64');
    console.log("Extracted card_1.png successfully.");
} else {
    console.log("No base64 png found.");
}
