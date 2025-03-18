class Visualizer {
    constructor(canvas, audioAnalyzer) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.audioAnalyzer = audioAnalyzer;
        this.animationId = null;
        this.recording = false;
        this.recordingFrames = [];
        this.mediaRecorder = null;
        this.chunks = [];
        this.settings = {
            style: 'waveform',
            theme: 'dark',
            customization: {
                color1: '#ff0000',
                color2: '#0000ff',
                sensitivity: 1.0,
                complexity: 0.5
            }
        };
        
        // For 3D visualizations
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        // Set canvas size initially
        this.resizeCanvas();
        
        // Handle window resize
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    resizeCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        
        // If 3D context is active
        if (this.renderer) {
            this.renderer.setSize(this.canvas.width, this.canvas.height);
            this.camera.aspect = this.canvas.width / this.canvas.height;
            this.camera.updateProjectionMatrix();
        }
    }
    
    startVisualization() {
        this.stopVisualization();
        
        // Initialize 3D context if needed
        if (this.settings.style === '3d' && !this.scene) {
            this.init3D();
        }
        
        const animate = () => {
            this.animationId = requestAnimationFrame(animate);
            
            if (!this.audioAnalyzer.isPlaying) return;
            
            // Clear canvas
            if (this.settings.style !== '3d') {
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            }
            
            // Get audio data
            const audioData = this.audioAnalyzer.analyzeAudio();
            
            // Choose visualization based on style
            switch (this.settings.style) {
                case 'waveform':
                    this.drawWaveform(audioData);
                    break;
                case 'bars':
                    this.drawBars(audioData);
                    break;
                case 'particles':
                    this.drawParticles(audioData);
                    break;
                case '3d':
                    this.draw3D(audioData);
                    break;
                default:
                    this.drawWaveform(audioData);
            }
            
            // Capture frame if recording
            if (this.recording) {
                try {
                    // Determine which canvas to capture
                    if (this.settings.style === '3d' && document.getElementById('3d-canvas')) {
                        // For 3D we need to capture both canvases and combine them
                        const canvas3D = document.getElementById('3d-canvas');
                        
                        // Create a temporary canvas to combine both
                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = canvas3D.width;
                        tempCanvas.height = canvas3D.height;
                        const tempCtx = tempCanvas.getContext('2d');
                        
                        // Draw the original canvas first (background)
                        tempCtx.drawImage(this.canvas, 0, 0, tempCanvas.width, tempCanvas.height);
                        
                        // Then draw the 3D canvas on top
                        tempCtx.drawImage(canvas3D, 0, 0, tempCanvas.width, tempCanvas.height);
                        
                        // Capture the combined image
                        this.recordingFrames.push(tempCanvas.toDataURL('image/jpeg', 0.95));
                    } else {
                        // For 2D visualizations, just capture the main canvas
                        this.recordingFrames.push(this.canvas.toDataURL('image/jpeg', 0.95));
                    }
                } catch (e) {
                    console.error("Error capturing frame:", e);
                }
            }
        };
        
        animate();
    }
    
    stopVisualization() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        // Cleanup 3D context if exists
        if (this.scene) {
            // Remove all 3D objects
            while(this.scene.children.length > 0) { 
                this.scene.remove(this.scene.children[0]); 
            }
            this.scene = null;
            this.camera = null;
            this.renderer = null;
            
            // Remove the 3D canvas if it exists
            const canvas3D = document.getElementById('3d-canvas');
            if (canvas3D) canvas3D.remove();
        }
    }
    
    drawWaveform(audioData) {
        const { timeData, beatDetection } = audioData;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // Set line style
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = beatDetection.isBeat ? this.settings.customization.color1 : this.settings.customization.color2;
        
        // Draw waveform
        this.ctx.beginPath();
        
        const sliceWidth = width / timeData.length;
        let x = 0;
        
        for (let i = 0; i < timeData.length; i++) {
            const v = timeData[i] / 128.0;
            const y = v * height / 2;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        
        this.ctx.lineTo(width, height / 2);
        this.ctx.stroke();
        
        // Draw beat indicator
        if (beatDetection.isBeat) {
            const pulseSize = height * 0.4 * this.settings.customization.sensitivity;
            
            this.ctx.fillStyle = this.settings.customization.color1;
            this.ctx.globalAlpha = 0.2;
            this.ctx.beginPath();
            this.ctx.arc(width / 2, height / 2, pulseSize, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.globalAlpha = 1.0;
        }
    }
    
    drawBars(audioData) {
        const { frequencyData, beatDetection } = audioData;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // Number of bars based on complexity setting
        const maxBars = Math.min(frequencyData.length, 512);
        const barCount = Math.floor(maxBars * this.settings.customization.complexity);
        const barWidth = width / barCount;
        
        const sensitivity = this.settings.customization.sensitivity * 2.5;
        
        for (let i = 0; i < barCount; i++) {
            // Skip some bars for efficiency
            const index = Math.floor(i * (frequencyData.length / barCount));
            
            // Bar height based on frequency data
            const barHeight = (frequencyData[index] / 255) * height * sensitivity;
            
            // Determine color based on frequency
            const hue = (i / barCount) * 360;
            let color;
            
            if (beatDetection.isBeat && frequencyData[index] > 200) {
                color = this.settings.customization.color1;
            } else {
                color = `hsl(${hue}, 100%, 50%)`;
            }
            
            // Draw bar
            this.ctx.fillStyle = color;
            this.ctx.fillRect(i * barWidth, height - barHeight, barWidth, barHeight);
            
            // Draw mirror effect
            this.ctx.globalAlpha = 0.3;
            this.ctx.fillRect(i * barWidth, 0, barWidth, barHeight);
            this.ctx.globalAlpha = 1.0;
        }
    }
    
    drawParticles(audioData) {
        const { frequencyData, beatDetection, tempo } = audioData;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // Create particle system if it doesn't exist
        if (!this.particles) {
            this.particles = [];
            const particleCount = Math.floor(200 * this.settings.customization.complexity);
            
            for (let i = 0; i < particleCount; i++) {
                this.particles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    size: Math.random() * 5 + 1,
                    speedX: (Math.random() - 0.5) * 2,
                    speedY: (Math.random() - 0.5) * 2,
                    color: `hsl(${Math.random() * 360}, 100%, 50%)`
                });
            }
        }
        
        // Draw background with fade effect
        this.ctx.fillStyle = this.settings.theme === 'dark' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)';
        this.ctx.fillRect(0, 0, width, height);
        
        // Get audio energy levels
        const bass = this.audioAnalyzer.getFrequencyBand('low');
        const mid = this.audioAnalyzer.getFrequencyBand('mid');
        const high = this.audioAnalyzer.getFrequencyBand('high');
        
        // Update and draw particles
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            
            // Update position based on audio
            const energyFactor = this.settings.customization.sensitivity;
            
            if (i % 3 === 0) {
                // Bass affects these particles
                p.x += p.speedX * (1 + bass * 5 * energyFactor);
                p.y += p.speedY * (1 + bass * 5 * energyFactor);
            } else if (i % 3 === 1) {
                // Mid frequencies affect these particles
                p.x += p.speedX * (1 + mid * 3 * energyFactor);
                p.y += p.speedY * (1 + mid * 3 * energyFactor);
            } else {
                // High frequencies affect these particles
                p.x += p.speedX * (1 + high * 2 * energyFactor);
                p.y += p.speedY * (1 + high * 2 * energyFactor);
            }
            
            // Bounce off walls
            if (p.x < 0 || p.x > width) p.speedX *= -1;
            if (p.y < 0 || p.y > height) p.speedY *= -1;
            
            // Size pulsates with beat
            let size = p.size;
            if (beatDetection.isBeat) {
                size *= 1.5;
            }
            
            // Draw particle
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Draw connections between particles
            if (this.settings.customization.complexity > 0.6) {
                for (let j = i + 1; j < this.particles.length; j++) {
                    const p2 = this.particles[j];
                    const dx = p.x - p2.x;
                    const dy = p.y - p2.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < 100) {
                        this.ctx.beginPath();
                        this.ctx.strokeStyle = p.color;
                        this.ctx.globalAlpha = 1 - (distance / 100);
                        this.ctx.lineWidth = 1;
                        this.ctx.moveTo(p.x, p.y);
                        this.ctx.lineTo(p2.x, p2.y);
                        this.ctx.stroke();
                        this.ctx.globalAlpha = 1.0;
                    }
                }
            }
        }
        
        // Display BPM if available
        if (tempo.bpm > 0 && tempo.confidence > 0.5) {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '16px Arial';
            this.ctx.fillText(`BPM: ${tempo.bpm}`, 20, 30);
        }
    }
    
    init3D() {
        try {
            console.log("Initializing 3D scene...");
            
            // Check Three.js availability again
            if (typeof THREE === 'undefined') {
                console.error("Three.js is not loaded! Falling back to 2D visualization.");
                this.settings.style = 'waveform';
                return;
            }
            
            // Create a new canvas for 3D to avoid context conflicts
            const container = this.canvas.parentElement;
            
            // Clear previous 3D elements if any
            const oldCanvas3D = document.getElementById('3d-canvas');
            if (oldCanvas3D) oldCanvas3D.remove();
            
            // Create dedicated 3D canvas
            const canvas3D = document.createElement('canvas');
            canvas3D.id = '3d-canvas';
            canvas3D.width = this.canvas.width;
            canvas3D.height = this.canvas.height;
            canvas3D.style.position = 'absolute';
            canvas3D.style.top = '0';
            canvas3D.style.left = '0';
            canvas3D.style.width = '100%';
            canvas3D.style.height = '100%';
            container.appendChild(canvas3D);
            
            // Create Three.js scene with performance optimizations
            this.scene = new THREE.Scene();
            // Set a background color (important for recording)
            this.scene.background = new THREE.Color(0x000000);
            
            // Use perspective camera with limited frustum for better performance
            this.camera = new THREE.PerspectiveCamera(75, canvas3D.width / canvas3D.height, 0.5, 50);
            
            // Try creating renderer with error checking and performance settings
            try {
                this.renderer = new THREE.WebGLRenderer({ 
                    canvas: canvas3D, 
                    alpha: true,
                    antialias: false,  // Disable antialiasing for performance
                    precision: "lowp", // Use low precision for better performance
                    powerPreference: "low-power", // Prefer power savings over performance
                    preserveDrawingBuffer: true  // Critical for recording WebGL content
                });
                
                this.renderer.setSize(canvas3D.width, canvas3D.height);
                console.log("3D renderer created successfully");
            } catch (e) {
                console.error("Failed to create WebGL renderer:", e);
                this.settings.style = 'waveform';
                return;
            }
            
            // Set camera position
            this.camera.position.z = 5;
            
            // Add ambient light - single light for performance
            const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); // Brighter light, no need for directional
            this.scene.add(ambientLight);
            
            // Skip directional light for performance
            
            // Add objects based on complexity
            if (!this.create3DObjects()) {
                // If object creation fails, fall back to 2D
                console.error("Failed to create 3D objects, falling back to 2D visualization");
                this.settings.style = 'waveform';
                return;
            }
            
            console.log("3D initialization complete");
        } catch (error) {
            console.error("Error in 3D initialization:", error);
            this.settings.style = 'waveform';
        }
    }
    
    create3DObjects() {
        try {
            console.log("Creating 3D objects...");
            
            // Clear existing objects (except lights)
            this.scene.children = this.scene.children.filter(child => 
                child instanceof THREE.AmbientLight || 
                child instanceof THREE.DirectionalLight
            );
            
            // Reset references
            this.centralObject = null;
            this.frequencyBars = [];
            this.particleSystem = null;
            
            const complexity = Math.min(0.5, this.settings.customization.complexity);
            console.log(`Using complexity: ${complexity}`);
            
            // Create simplified central object - using simpler geometry
            console.log("Creating central object...");
            let geometry;
            
            // Use simpler geometry for Intel integrated GPUs
            geometry = new THREE.SphereGeometry(1, 16, 12);
            
            // Use basic materials instead of phong for better performance
            const material = new THREE.MeshBasicMaterial({
                color: new THREE.Color(this.settings.customization.color1),
                wireframe: true
            });
            
            this.centralObject = new THREE.Mesh(geometry, material);
            this.scene.add(this.centralObject);
            console.log("Central object created");
            
            // Create simplified frequency bars - reduced count
            console.log("Creating frequency bars...");
            this.frequencyBars = [];
            // Reduce bar count dramatically for Intel integrated GPUs
            const barCount = Math.floor(24 * complexity);
            
            for (let i = 0; i < barCount; i++) {
                if (i % 10 === 0) console.log(`Creating bar ${i}/${barCount}...`);
                
                const barGeometry = new THREE.BoxGeometry(0.05, 0.05, 1);
                const barMaterial = new THREE.MeshBasicMaterial({
                    color: new THREE.Color(`hsl(${(i / barCount) * 360}, 100%, 50%)`)
                });
                
                const bar = new THREE.Mesh(barGeometry, barMaterial);
                
                // Position in a circle
                const angle = (i / barCount) * Math.PI * 2;
                const radius = 2.5;
                bar.position.x = Math.cos(angle) * radius;
                bar.position.y = Math.sin(angle) * radius;
                bar.position.z = 0;
                
                // Rotate to point outward
                bar.rotation.z = angle + Math.PI / 2;
                
                this.scene.add(bar);
                this.frequencyBars.push(bar);
            }
            console.log("Frequency bars created");
            
            // Skip particle system for performance reasons
            console.log("Skipping particle system for performance");
            
            console.log("3D objects created successfully");
            return true;
        } catch (error) {
            console.error("Error creating 3D objects:", error);
            return false;
        }
    }
    
    draw3D(audioData) {
        try {
            if (!this.scene || !this.camera || !this.renderer) {
                // If 3D is not properly initialized, try to initialize it
                if (this.settings.style === '3d' && !this.scene) {
                    this.init3D();
                    
                    // If still not initialized, fallback to 2D
                    if (!this.scene || !this.camera || !this.renderer) {
                        console.warn("3D rendering still unavailable, falling back to waveform");
                        this.settings.style = 'waveform';
                        return;
                    }
                } else {
                    return;
                }
            }
            
            const { frequencyData, beatDetection } = audioData;
            
            // Get band levels with error handling
            let bass = 0, mid = 0, high = 0;
            try {
                bass = this.audioAnalyzer.getFrequencyBand('low');
                mid = this.audioAnalyzer.getFrequencyBand('mid');
                high = this.audioAnalyzer.getFrequencyBand('high');
            } catch (e) {
                console.error("Error getting frequency bands:", e);
            }
            
            const sensitivity = Math.min(this.settings.customization.sensitivity, 1.5);
            
            // Clear the canvas with a background color (helps with recording)
            const canvas3D = document.getElementById('3d-canvas');
            if (canvas3D) {
                const ctx = canvas3D.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = 'black';
                    ctx.fillRect(0, 0, canvas3D.width, canvas3D.height);
                }
            }
            
            // Animate central object - with limits to prevent excessive calculations
            if (this.centralObject) {
                this.centralObject.rotation.x += 0.005 + bass * 0.02 * sensitivity;
                this.centralObject.rotation.y += 0.01 + mid * 0.02 * sensitivity;
                
                // Scale with beat - limit scale factor
                const scale = 1 + Math.min(bass * sensitivity, 0.5);
                this.centralObject.scale.set(scale, scale, scale);
            }
            
            // Animate frequency bars - simplified with error handling
            if (this.frequencyBars && this.frequencyBars.length > 0) {
                const frequencyStep = Math.floor(frequencyData.length / this.frequencyBars.length);
                
                for (let i = 0; i < this.frequencyBars.length; i++) {
                    try {
                        const index = Math.min(i * frequencyStep, frequencyData.length - 1);
                        const value = frequencyData[index] / 255;
                        
                        // Limit scale to prevent performance issues
                        const scale = 0.1 + Math.min(value * 2 * sensitivity, 3);
                        this.frequencyBars[i].scale.z = scale;
                    } catch (e) {
                        // Silently fail individual bar updates
                    }
                }
            }
            
            // Make sure WebGL content is preserved (helps with recording)
            if (this.renderer) {
                this.renderer.preserveDrawingBuffer = true;
            }
            
            // Render scene - with frame rate limiting for better performance
            const now = performance.now();
            if (!this._lastRender || now - this._lastRender > 33 || this.recording) { // Always render when recording
                this.renderer.render(this.scene, this.camera);
                this._lastRender = now;
            }
        } catch (error) {
            console.error("Error in 3D rendering:", error);
            // Fallback to 2D visualization on error
            this.settings.style = 'waveform';
        }
    }
    
    setStyle(style) {
        this.settings.style = style;
        
        // Cleanup previous state
        this.particles = null;
        
        // Remove any existing 3D canvas when switching away from 3D
        if (style !== '3d') {
            const canvas3D = document.getElementById('3d-canvas');
            if (canvas3D) canvas3D.remove();
        }
        
        // Initialize 3D if needed
        if (style === '3d' && !this.scene) {
            console.log("Switching to 3D visualization");
            this.init3D();
            
            // If 3D initialization fails, fall back to waveform
            if (!this.scene || !this.camera || !this.renderer) {
                console.warn("Failed to initialize 3D, falling back to waveform");
                this.settings.style = 'waveform';
                
                // Notify user
                alert("3D visualization is not supported in your browser. Falling back to waveform visualization.");
            }
        }
    }
    
    setTheme(theme) {
        this.settings.theme = theme;
    }
    
    setCustomization(options) {
        this.settings.customization = { ...this.settings.customization, ...options };
        
        // Update 3D objects if needed
        if (this.settings.style === '3d' && this.scene) {
            this.create3DObjects();
        }
    }
    
    startRecording(options = {}) {
        this.recording = true;
        this.recordingFrames = [];
        
        const resolution = options.resolution || '1080p';
        const format = options.format || 'mp4';
        
        // Set recording resolution
        const originalWidth = this.canvas.width;
        const originalHeight = this.canvas.height;
        
        let recordingWidth, recordingHeight;
        
        switch (resolution) {
            case '720p':
                recordingWidth = 1280;
                recordingHeight = 720;
                break;
            case '1080p':
                recordingWidth = 1920;
                recordingHeight = 1080;
                break;
            case '4k':
                recordingWidth = 3840;
                recordingHeight = 2160;
                break;
            default:
                recordingWidth = originalWidth;
                recordingHeight = originalHeight;
        }
        
        // Store original size to restore later
        this.originalSize = { width: originalWidth, height: originalHeight };
        
        // For 3D visualization, we need to handle the 3D canvas
        if (this.settings.style === '3d' && document.getElementById('3d-canvas')) {
            console.log("Setting up recording for 3D visualization");
            const canvas3D = document.getElementById('3d-canvas');
            
            // Store original 3D canvas size
            this.original3DSize = { 
                width: canvas3D.width, 
                height: canvas3D.height 
            };
            
            // Set 3D canvas to recording size
            canvas3D.width = recordingWidth;
            canvas3D.height = recordingHeight;
            
            // Update renderer size
            if (this.renderer) {
                this.renderer.setSize(recordingWidth, recordingHeight);
                this.camera.aspect = recordingWidth / recordingHeight;
                this.camera.updateProjectionMatrix();
            }
        } else {
            // Set 2D canvas to recording size
            this.canvas.width = recordingWidth;
            this.canvas.height = recordingHeight;
        }
        
        console.log(`Recording setup: ${recordingWidth}x${recordingHeight}, format: ${format}`);
        
        return {
            width: recordingWidth,
            height: recordingHeight,
            format: format
        };
    }
    
    stopRecording() {
        this.recording = false;
        
        // Restore original canvas size
        if (this.originalSize) {
            this.canvas.width = this.originalSize.width;
            this.canvas.height = this.originalSize.height;
            this.originalSize = null;
        }
        
        // Restore 3D canvas size if applicable
        if (this.original3DSize && document.getElementById('3d-canvas')) {
            const canvas3D = document.getElementById('3d-canvas');
            canvas3D.width = this.original3DSize.width;
            canvas3D.height = this.original3DSize.height;
            
            // Update renderer
            if (this.renderer) {
                this.renderer.setSize(this.original3DSize.width, this.original3DSize.height);
                this.camera.aspect = this.original3DSize.width / this.original3DSize.height;
                this.camera.updateProjectionMatrix();
            }
            
            this.original3DSize = null;
        }
        
        console.log(`Recording stopped with ${this.recordingFrames.length} frames captured`);
        return this.recordingFrames;
    }
    
    exportVideo(frames, fps = 30, format = 'mp4') {
        return new Promise((resolve, reject) => {
            if (frames.length === 0) {
                reject(new Error('No frames to export'));
                return;
            }
            
            // Create a temporary canvas for the video
            const tempCanvas = document.createElement('canvas');
            
            // Get first frame to determine dimensions
            const img = new Image();
            img.onload = () => {
                tempCanvas.width = img.width;
                tempCanvas.height = img.height;
                const ctx = tempCanvas.getContext('2d');
                
                // Set MIME type based on format
                const mimeType = format === 'webm' ? 'video/webm' : 'video/mp4';
                
                // Set up media recorder
                try {
                    const stream = tempCanvas.captureStream(fps);
                    this.mediaRecorder = new MediaRecorder(stream, {
                        mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'video/webm',
                        videoBitsPerSecond: 8000000 // 8 Mbps
                    });
                    
                    this.chunks = [];
                    this.mediaRecorder.ondataavailable = (e) => {
                        if (e.data.size > 0) {
                            this.chunks.push(e.data);
                        }
                    };
                    
                    this.mediaRecorder.onstop = () => {
                        const blob = new Blob(this.chunks, { type: mimeType });
                        const url = URL.createObjectURL(blob);
                        resolve(url);
                    };
                    
                    // Start recording
                    this.mediaRecorder.start();
                    
                    // Process frames
                    let frameIndex = 0;
                    
                    const processFrame = () => {
                        if (frameIndex < frames.length) {
                            const frameImg = new Image();
                            frameImg.onload = () => {
                                ctx.drawImage(frameImg, 0, 0);
                                frameIndex++;
                                
                                // Schedule next frame
                                setTimeout(processFrame, 1000 / fps);
                            };
                            frameImg.src = frames[frameIndex];
                        } else {
                            // End recording
                            this.mediaRecorder.stop();
                        }
                    };
                    
                    // Start processing frames
                    processFrame();
                    
                } catch (error) {
                    reject(error);
                }
            };
            
            img.src = frames[0];
        });
    }
}

// main.js
// Function to dynamically load scripts
function loadScript(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
        document.head.appendChild(script);
    });
}

// Load required libraries first
async function loadLibraries() {
    try {
        // Try multiple CDNs for Three.js
        try {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r148/three.min.js');
        } catch (e) {
            console.warn("Failed to load Three.js from cdnjs, trying unpkg...");
            await loadScript('https://unpkg.com/three@0.148.0/build/three.min.js');
        }
        
        // Load dat.GUI
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/dat-gui/0.7.9/dat.gui.min.js');
        
        console.log("All libraries loaded successfully!");
        return true;
    } catch (error) {
        console.error("Error loading libraries:", error);
        return false;
    }
}