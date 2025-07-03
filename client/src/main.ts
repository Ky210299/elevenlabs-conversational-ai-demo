import './style.css';
import { Conversation } from "@elevenlabs/client";

import { createParticleAvatar, initAudioAnalysis, playAndAnalyzeAudio, resumeAudioContext, stopAudioPlayback } from './avatar';

type BaseEvent = { type: string; };
type UserTranscriptEvent = BaseEvent & { type: "user_transcript"; user_transcription_event: { user_transcript: string; }; };
type AgentResponseEvent = BaseEvent & { type: "agent_response"; agent_response_event: { agent_response: string; }; };
type AudioResponseEvent = BaseEvent & { type: "audio"; audio_event?: { audio_base_64: string; event_id: number; }; };
type InterruptionEvent = BaseEvent & { type: "interruption"; interruption_event: { reason: string; }; };
type PingEvent = BaseEvent & { type: "ping"; ping_event: { event_id: number; ping_ms?: number; }; };
export type ElevenLabsWebSocketEvent = UserTranscriptEvent | AgentResponseEvent | AudioResponseEvent | InterruptionEvent | PingEvent;

const SERVER_HOST = import.meta.env.VITE_SERVER_HOST || 'localhost';
const SERVER_PORT = import.meta.env.VITE_SERVER_PORT || '3000';
async function getSignedUrl(){
    const response = await fetch(`http://${SERVER_HOST}:${SERVER_PORT}/signed_url`);
    if(!response.ok) {
        console.error("Failed to fetch signed URL:", response.statusText);
    }
    const signedUrl = await response.text();
    return signedUrl
}
async function getConversationToken(){
    const response = await fetch(`http://${SERVER_HOST}:${SERVER_PORT}/conversation_token`);
    if(!response.ok) {
        console.error("Failed to fetch signed URL:", response.statusText);
    }
    const token = await response.text();
    return token
}

let conversation: Conversation | null = null;
type UIState = 'IDLE' | 'CONNECTING' | 'STREAMING' | 'ERROR';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.className = 'flex flex-col md:flex-row h-screen w-screen items-center justify-between p-4 gap-8';

app.innerHTML = `
    <div id="avatar-container" class="w-[1000px] h-[700px] flex items-center justify-center">
    </div>

    <div class="w-full md:w-1/2 flex items-center justify-center">
        <div id="chat-card" class="bg-gray-800 p-8 rounded-2xl z-0 shadow-2xl w-full max-w-md space-y-6 border border-gray-700 font-sans">
            <div class="text-center">
                <h1 class="text-3xl font-bold text-cyan-400">Voice Chatbot</h1>
                <p class="text-gray-400 mt-2">Usa tu voz o escribe un mensaje.</p>
            </div>
            <div>
                <label for="conversationType" class="block text-sm font-medium text-gray-400 mb-1">Conversation Type</label>
                <select id="conversationType" class="w-full bg-gray-700 text-white p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 border border-gray-600">
                    <option value="websocket">WebSocket</option>
                </select>
            </div>
            
            <div class="flex items-center justify-center space-x-3 bg-gray-900 p-4 rounded-lg">
                <div id="indicator" class="recording-indicator"></div>
                <span id="status" class="text-lg font-medium text-gray-300">Disconnected</span>
            </div>
            
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button id="startBtn" class="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-opacity-75">
                    Start Voice
                </button>
                <button id="stopBtn" class="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-75" disabled>
                    Stop Voice
                </button>
            </div>
            
            <div class="flex gap-2">
                <input type="text" id="textInput" placeholder="Escribe un mensaje..." class="flex-grow bg-gray-700 text-white placeholder-gray-400 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                <button id="sendBtn" class="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105">&gt;</button>
            </div>
            
            <div class="space-y-2">
                <h2 class="text-xl font-semibold text-gray-300 border-b border-gray-700 pb-2">Conversation</h2>
                <div id="transcript" class="bg-gray-900 p-4 rounded-lg h-40 overflow-y-auto text-gray-400 text-sm">
                </div>
            </div>
        </div>
    </div>
`;

const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const indicatorEl = document.getElementById('indicator') as HTMLDivElement;
const transcriptEl = document.getElementById('transcript') as HTMLDivElement;
const textInput = document.getElementById('textInput') as HTMLInputElement;
const sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
const conversationTypeSelect = document.getElementById('conversationType') as HTMLSelectElement;
const avatarContainer = document.getElementById('avatar-container') as HTMLDivElement;

const camera = createParticleAvatar(avatarContainer)
initAudioAnalysis(camera)

function setUIState(state: UIState) {
    statusEl.className = 'text-lg font-medium text-gray-300'; 

    switch (state) {
        case 'IDLE':
            startBtn.disabled = false;
            stopBtn.disabled = true;
            sendBtn.disabled = true;
            textInput.disabled = true;
            indicatorEl.classList.remove('is-recording');
            statusEl.textContent = 'Disconnected';
            break;
        case 'CONNECTING':
            startBtn.disabled = true;
            stopBtn.disabled = true;
            sendBtn.disabled = true;
            textInput.disabled = true;
            indicatorEl.classList.remove('is-recording');
            statusEl.textContent = 'Connecting...';
            break;
        case 'STREAMING':
            startBtn.disabled = true;
            stopBtn.disabled = false;
            sendBtn.disabled = false; 
            textInput.disabled = false;
            indicatorEl.classList.add('is-recording');
            statusEl.textContent = 'Streaming...';
            break;
        case 'ERROR':
            startBtn.disabled = false; 
            stopBtn.disabled = true;
            sendBtn.disabled = true;
            textInput.disabled = true;
            indicatorEl.classList.remove('is-recording');
            statusEl.textContent = 'Error!';
            statusEl.className = 'text-lg font-medium text-red-500';
            break;
    }
}

function logMessage(message: string, from: 'user' | 'agent' | 'system' | "ai" = 'system') {
    if (transcriptEl.innerHTML.includes('Waiting for connection...')) {
        transcriptEl.innerHTML = '';
    }

    const p = document.createElement('p');
    let prefix = '';
    switch (from) {
        case 'user':
            p.className = 'text-cyan-300';
            prefix = 'You: ';
            break;
        case 'agent': 
        case 'ai':  
            p.className = 'text-green-300';
            prefix = 'Agent: ';
            break;
        case 'system':
        default:
            p.className = 'text-gray-500 italic';
            break;
    }
    
    p.textContent = `${prefix}${message}`;
    transcriptEl.appendChild(p);
    transcriptEl.scrollTop = transcriptEl.scrollHeight; 
}

async function startStreaming() {
    try {
        setUIState('CONNECTING');
        logMessage('Requesting microphone access...', 'system');
        
        conversation = await Conversation.startSession({
            signedUrl: await getSignedUrl(),
            conversationToken: await getConversationToken(),
            connectionType: conversationTypeSelect.value as "webrtc" | "websocket",
            dynamicVariables: { username: "Leonardo" },
            onConnect: (message) => {
                logMessage("Conversation ID: " + message.conversationId);
                setUIState('STREAMING');
            },
            onMessage: (message) => logMessage(message.message, message.source),
            onError: (error) => {
                console.error("Conversation error:", error);
                logMessage(error, 'system');
                setUIState('ERROR');
            },
            onDisconnect: async () => {
                logMessage('Disconnected from server.', 'system');
                await stopStreaming(); 
            },
            onAudio: (audioBase64) => {
                
                console.log("Received audio:");
                resumeAudioContext();
                playAndAnalyzeAudio(audioBase64);
            },
            onModeChange: (mode) => {
                if (mode.mode === "listening") stopAudioPlayback()
            }
        });
    } catch (err) {
        console.error("Failed to start streaming:", err);
        logMessage("Could not start session. Check console.", 'system');
        setUIState('ERROR');
    }
}

async function stopStreaming() {
    if (!conversation) return;
    await conversation.endSession();
    conversation = null;
    setUIState('IDLE');
}

function sendTextMessage() {
    const message = textInput.value.trim();
    if (!message || !conversation) return;

    logMessage(message, 'user');
    conversation.sendUserMessage(message); 
    textInput.value = '';
}

startBtn.addEventListener('click', startStreaming);
stopBtn.addEventListener('click', stopStreaming); 
sendBtn.addEventListener('click', sendTextMessage);
textInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault(); 
        sendTextMessage();
    }
});

transcriptEl.innerHTML = '<p class="text-gray-500 italic">Waiting for connection...</p>';
setUIState('IDLE');