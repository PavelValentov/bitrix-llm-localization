const content = `<? $MESS["TRANS_FROM"] = ""; $MESS["TRANS_TO"] = ""; $MESS["CORRECT_FROM"] = ''; $MESS["CORRECT_TO"] = ''; ?>`;

const regex = /\$MESS\s*\[\s*(['"])([^'"]+)\1\s*\]\s*=\s*(['"])((?:(?!\3|\\).|\\.|[\r\n])*)\3\s*;/g;

console.log("Testing content:", content);

let match;
let count = 0;
while ((match = regex.exec(content)) !== null) {
    console.log(`Match ${++count}:`);
    console.log(`  Key: ${match[2]}`);
    console.log(`  Value: "${match[4]}"`);
}

if (count === 0) {
    console.log("No matches found!");
} else {
    console.log(`Found ${count} matches.`);
}
