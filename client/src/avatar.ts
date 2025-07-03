import * as THREE from 'three';

let particles: THREE.Points | null = null;
let listener: THREE.AudioListener | null = null;
let analyser: AnalyserNode | null = null;
let frequencyData: Uint8Array | null = null;

const audioQueue: AudioBuffer[] = [];
let isPlaying = false;
let audioContextResumed = false; 

let currentAudioSource: AudioBufferSourceNode | null = null;

export function resumeAudioContext() {
    if (listener && listener.context.state === 'suspended') {
        listener.context.resume().then(() => {
            console.log("AudioContext resumed.");
            audioContextResumed = true; 
            
            processQueue();
        });
    } else if (listener && listener.context.state === 'running') {
        audioContextResumed = true; 
    }
}

export function initAudioAnalysis(camera: THREE.Camera) {
    
    if (listener) {
        console.warn("AudioListener already initialized.");
        return;
    }

    listener = new THREE.AudioListener();
    camera.add(listener);

    analyser = listener.context.createAnalyser();
    analyser.fftSize = 256; 
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    
    analyser.connect(listener.context.destination);

    resumeAudioContext();
}

/**
 * Play and analyze audio from a base64 string.
 */
export function playAndAnalyzeAudio(audioBase64: string) {
    if (!listener || !audioContextResumed) {
        console.warn("AudioContext not ready or resumed. Queuing audio, but playback will wait.");
        queueAudioBufferFromBase64(audioBase64);
        return;
    }

    queueAudioBufferFromBase64(audioBase64);
    processQueue();
}


function queueAudioBufferFromBase64(audioBase64: string) {
    if (!listener) return;

    try {
        const binaryString = window.atob(audioBase64);
        
        const buffer = new ArrayBuffer(binaryString.length);
        const view = new Uint8Array(buffer);
        for (let i = 0; i < binaryString.length; i++) {
            view[i] = binaryString.charCodeAt(i);
        }

        
        
        const numSamples = view.length / 2; 
        const audioBuffer = listener.context.createBuffer(1, numSamples, 16000); 

        const channelData = audioBuffer.getChannelData(0);
        const dataView = new DataView(buffer);

        for (let i = 0; i < numSamples; i++) {
            
            const sample = dataView.getInt16(i * 2, true);
            
            channelData[i] = sample / 32768.0;
        }

        audioQueue.push(audioBuffer);
    } catch (error) {
        console.error("Error processing PCM audio from base64:", error);
    }
}


/**
 * Process the audio queue.
 */
function processQueue() {
    
    
    if (isPlaying || audioQueue.length === 0 || !listener || !analyser || !audioContextResumed) {
        return;
    }

    isPlaying = true;

    const audioBuffer = audioQueue.shift()!; 

    const source = listener.context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser); 
    source.start(0); 

    
    currentAudioSource = source;

    source.onended = () => {
        isPlaying = false;
        source.disconnect(); 
        currentAudioSource = null; 
        processQueue(); 
    };
}

/**
 * Stop the current audio playback and clear the queue.
 */
export function stopAudioPlayback() {
    
    if (currentAudioSource) {
        try {
            currentAudioSource.stop(); 
            currentAudioSource.disconnect(); 
            console.log("Audio playback stopped.");
        } catch (error) {
            console.warn("Error stopping current audio source:", error);
        } finally {
            currentAudioSource = null; 
            isPlaying = false; 
        }
    }

    
    while (audioQueue.length > 0) {
        audioQueue.pop(); 
    }
    console.log("Audio queue cleared.");
}



export function createParticleAvatar(container: HTMLElement): THREE.PerspectiveCamera {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.z = 15;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    
    const particleCount = 2500;
    const positions = new Float32Array(particleCount * 3);
    const geometry = new THREE.BufferGeometry();
    const radius = 6;
    for (let i = 0; i < particleCount; i++) {
        const theta = THREE.MathUtils.randFloatSpread(360);
        const phi = THREE.MathUtils.randFloatSpread(360);
        positions[i * 3] = radius * Math.sin(theta) * Math.cos(phi);
        positions[i * 3 + 1] = radius * Math.sin(theta) * Math.sin(phi);
        positions[i * 3 + 2] = radius * Math.cos(theta);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    geometry.setAttribute('originalPosition', new THREE.BufferAttribute(positions.slice(), 3)); 
    
    const material = new THREE.PointsMaterial({
        color: 0x00bfff, 
        size: 0.1,
        blending: THREE.AdditiveBlending, 
        transparent: true,
        sizeAttenuation: true, 
    });
    particles = new THREE.Points(geometry, material);
    scene.add(particles);
    
    const clock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);
        
        let audioIntensity = 0;
        if (analyser && frequencyData) {
            analyser.getByteFrequencyData(frequencyData);
            let sum = 0;
            
            for (const value of frequencyData) {
                sum += value;
            }
            audioIntensity = frequencyData.length > 0 ? sum / frequencyData.length : 0;
        }
        
        if (!particles) return;
        
        const normalizedAudioIntensity = audioIntensity / 255; 
        const scaleFactor = normalizedAudioIntensity * 0.4; 
        
        const elapsedTime = clock.getElapsedTime();
        particles.rotation.y = elapsedTime * 0.1; 
        
        const current_positions = particles.geometry.attributes.position.array as Float32Array;
        const originalPositions = particles.geometry.attributes.originalPosition.array as Float32Array;
        
        
        
        for (let i = 0; i < particleCount; i++) {
            const scale = 1.0 + scaleFactor * (1 + Math.sin(i * 0.1));
            current_positions[i * 3] = originalPositions[i * 3] * scale;
            current_positions[i * 3 + 1] = originalPositions[i * 3 + 1] * scale;
            current_positions[i * 3 + 2] = originalPositions[i * 3 + 2] * scale;
        }
        particles.geometry.attributes.position.needsUpdate = true; 
        
        renderer.render(scene, camera);
    }
    
    const resizeObserver = new ResizeObserver(entries => {
        const entry = entries[0];
        const { width, height } = entry.contentRect;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    });
    resizeObserver.observe(container);

    animate();
    return camera;
}