import * as fs from 'fs';
import * as path from 'path';

// Path to the problematic file
const filePath = 'business50/en/main/lang/en/js_core_translit.php';
const fullPath = path.resolve(filePath);

console.log(`Reading file: ${fullPath}`);

try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    console.log(`Content Length: ${content.length}`);
    console.log(`Raw Content:\n${content}`);
    
    // Test Regex against this specific file content
    const regex = /\$MESS\s*\[\s*(['"])([^'"]+)\1\s*\]\s*=\s*(['"])((?:(?!\3|\\).|\\.|[\r\n])*)\3\s*;/g;
    
    let match;
    let count = 0;
    while ((match = regex.exec(content)) !== null) {
        count++;
        console.log(`Match ${count}: Key=${match[2]}`);
    }
    
    if (count === 0) {
        console.log("NO MATCHES FOUND via Regex on file content!");
        
        // Let's debug why. Print hex dump of first 50 chars to see if there are hidden chars
        const buffer = fs.readFileSync(fullPath);
        console.log("\nHex dump of start:");
        console.log(buffer.subarray(0, 100).toString('hex'));
        console.log(buffer.subarray(0, 100).toString('utf-8'));
    }

} catch (err) {
    console.error(`Error reading file:`, err);
}
