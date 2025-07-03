import express from 'express';
import http from 'node:http';
import cors from 'cors';

try { 
    process.loadEnvFile() 
} 
catch (err) {
    throw new Error("Error loading environment variables")
}
const AGENT_ID = process.env.ELEVENLABS_AGENT_ID;
const API_KEY = process.env.ELEVENLABS_API_KEY;

const app = express()

app.use(cors())
app.use(express.json())

const server = http.createServer(app)
function authenticateUser(req: http.IncomingMessage) {
    // Authentification function
}

async function getWebRTCToken(){
    const options = {
      headers: {
        "xi-api-key": API_KEY || "",
      },
    };
    const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${AGENT_ID}`, options)
    if (!res.ok) {
        console.error(`Failed to get signed URL: ${res.status} ${res.statusText}`);
        return
    }
    const { token } = await res.json();
    return token;
}
async function getSignedURL(){
    const options = {
      headers: {
        "xi-api-key": API_KEY || "",
      },
    };
    const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${AGENT_ID}`, options)
    if (!res.ok) {
        console.error(`Failed to get signed URL: ${res.status} ${res.statusText}`);
        return
    }
    const { signed_url } = await res.json();
    return signed_url;
}

/** ROUTES */
app.get("/signed_url", async (req,res)=> {
    const signedUrl = await getSignedURL();
    res.send(signedUrl);
})

app.get("/conversation_token", async (req, res) => {
    const token = await getWebRTCToken();
    res.send(token);
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT}`);
});