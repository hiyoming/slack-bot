const fs = require('fs');
const readline = require('readline');

async function processLineByLine() {
  const fileStream = fs.createReadStream('C:\\Users\\김희연\\.gemini\\antigravity\\brain\\e996d807-049d-452c-a0af-74ba4d9f17cd\\.system_generated\\logs\\transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const json = JSON.parse(line);
    if (json.type === 'USER_INPUT' && json.content.includes('#진료일정')) {
      console.log(json.content);
      break;
    }
  }
}
processLineByLine();
