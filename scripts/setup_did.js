const fs = require('fs');
const path = require('path');

const apiKey = process.argv[2];
const imagePath = path.join(__dirname, '../public/avatar.jpg');

async function main() {
  try {
    console.log('Uploading image...');
    const formData = new FormData();
    const fileData = new Blob([fs.readFileSync(imagePath)], { type: 'image/jpeg' });
    formData.append('image', fileData, 'avatar.jpg');

    const uploadRes = await fetch('https://api.d-id.com/images', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + apiKey
      },
      body: formData
    });

    const uploadData = await uploadRes.json();
    console.log('Upload Data:', uploadData);

    if (!uploadData.url) {
      throw new Error('Failed to upload image. No URL returned.');
    }

    const sourceUrl = uploadData.url;

    console.log('Creating Agent...');
    const agentRes = await fetch('https://api.d-id.com/agents', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        preview_name: "Karina Assistant",
        presenter: {
          type: "talk",
          source_url: sourceUrl,
          voice: {
            type: "microsoft",
            voice_id: "ko-KR-SunHiNeural"
          }
        },
        llm: {
          type: "openai",
          provider: "openai",
          model: "gpt-3.5-turbo",
          instructions: "You are a helpful assistant."
        }
      })
    });

    const agentData = await agentRes.json();
    console.log('Agent Data:', agentData);
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
