// Start application after DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    // Try to load libraries first
    const librariesLoaded = await loadLibraries();
    const fileInput = document.getElementById('audio-upload');
    const fileNameDisplay = document.getElementById('file-name');
    const audioPlayer = document.getElementById('audio-player');
    const playerControls = document.getElementById('player-controls');
    const visualizationStyleSelect = document.getElementById('visualization-style');
    const themeToggle = document.getElementById('theme-toggle');
    const exportBtn = document.getElementById('export-btn');
    const exportSettings = document.getElementById('export-settings');
    const startExportBtn = document.getElementById('start-export');
    const cancelExportBtn = document.getElementById('cancel-export');
    const loadingIndicator = document.getElementById('loading');
    const canvas = document.getElementById('visualization-canvas');
    
    // Initialize audio analyzer and visualizer
    const audioAnalyzer = new AudioAnalyzer();
    const visualizer = new Visualizer(canvas, audioAnalyzer);
    
    // Disable 3D option if Three.js failed to load
    if (!librariesLoaded || typeof THREE === 'undefined') {
        console.warn("Three.js is not available. Disabling 3D visualization option.");
        const option3D = Array.from(visualizationStyleSelect.options).find(opt => opt.value === '3d');
        if (option3D) {
            option3D.disabled = true;
            option3D.text += " (Not available)";
        }
    }
    // Set up GUI for advanced customization
    const gui = new dat.GUI({ autoPlace: false, width: 300 });
    gui.domElement.style.position = 'absolute';
    gui.domElement.style.top = '10px';
    gui.domElement.style.right = '10px';
    document.querySelector('.canvas-container').appendChild(gui.domElement);
    gui.close(); // Start with closed panel
    
    // Add customization controls
    const customFolder = gui.addFolder('Customization');
    customFolder.addColor(visualizer.settings.customization, 'color1').name('Primary Color').onChange(value => {
        visualizer.setCustomization({ color1: value });
    });
    customFolder.addColor(visualizer.settings.customization, 'color2').name('Secondary Color').onChange(value => {
        visualizer.setCustomization({ color2: value });
    });
    customFolder.add(visualizer.settings.customization, 'sensitivity', 0.1, 3).name('Sensitivity').onChange(value => {
        visualizer.setCustomization({ sensitivity: value });
    });
    customFolder.add(visualizer.settings.customization, 'complexity', 0.1, 1).name('Complexity').onChange(value => {
        visualizer.setCustomization({ complexity: value });
    });
    customFolder.open();
    
    // Handle file upload
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            // Show loading indicator
            loadingIndicator.classList.remove('hidden');
            
            // Display file name
            fileNameDisplay.textContent = file.name;
            
            // Load audio for analysis
            await audioAnalyzer.loadAudio(file);
            
            // Create object URL for audio player
            const objectURL = URL.createObjectURL(file);
            audioPlayer.src = objectURL;
            
            // Show player controls
            playerControls.classList.remove('hidden');
            
            // Start visualization
            visualizer.startVisualization();
            
            // Set up audio player events
            audioPlayer.addEventListener('play', () => {
                audioAnalyzer.play();
            });
            
            audioPlayer.addEventListener('pause', () => {
                audioAnalyzer.stop();
            });
            
            audioPlayer.addEventListener('ended', () => {
                audioAnalyzer.stop();
            });
            
        } catch (error) {
            console.error('Error loading audio:', error);
            alert('Failed to load audio file. Please try again with a different file.');
        } finally {
            // Hide loading indicator
            loadingIndicator.classList.add('hidden');
        }
    });
    
    // Handle visualization style change
    visualizationStyleSelect.addEventListener('change', (e) => {
        const newStyle = e.target.value;
        
        // If selecting 3D, check Three.js availability first
        if (newStyle === '3d' && typeof THREE === 'undefined') {
            console.error("Three.js is not loaded! Cannot switch to 3D visualization.");
            alert("3D visualization is not available. Please check your internet connection as Three.js could not be loaded.");
            
            // Reset select to previous value
            e.target.value = visualizer.settings.style;
            return;
        }
        
        visualizer.setStyle(newStyle);
    });
    
    // Handle theme toggle
    themeToggle.addEventListener('click', () => {
        const body = document.body;
        const isDarkMode = body.classList.toggle('dark-mode');
        
        visualizer.setTheme(isDarkMode ? 'dark' : 'light');
        themeToggle.textContent = isDarkMode ? 'Light Mode' : 'Dark Mode';
    });
    
    // Initialize with dark mode
    document.body.classList.add('dark-mode');
    
    // Handle export button
    exportBtn.addEventListener('click', () => {
        exportSettings.classList.toggle('hidden');
    });
    
    // Handle export cancel
    cancelExportBtn.addEventListener('click', () => {
        exportSettings.classList.add('hidden');
    });
    
    // Handle export start
    startExportBtn.addEventListener('click', async () => {
        if (!audioAnalyzer.audioBuffer) {
            alert('Please load an audio file first');
            return;
        }
        
        try {
            // Show loading indicator
            loadingIndicator.classList.remove('hidden');
            loadingIndicator.textContent = "Preparing export...";
            exportSettings.classList.add('hidden');
            
            // Get export settings
            const resolution = document.getElementById('export-resolution').value;
            const format = document.getElementById('export-format').value;
            
            // For 3D visualizations, we need special handling
            if (visualizer.settings.style === '3d') {
                console.log("Setting up 3D export...");
                // Give a better warning/indicator to the user
                loadingIndicator.textContent = "Processing 3D visualization (this may take longer)...";
                
                // Force a render to ensure the 3D scene is ready
                visualizer.draw3D(audioAnalyzer.analyzeAudio());
            }
            
            // Start recording after a short delay to ensure UI updates
            setTimeout(async () => {
                // Start recording
                visualizer.startRecording({ resolution, format });
                
                // Reset audio player and start playing
                audioPlayer.currentTime = 0;
                loadingIndicator.textContent = "Recording visualization...";
                audioPlayer.play();
                
                // Wait for audio to finish
                await new Promise(resolve => {
                    audioPlayer.addEventListener('ended', resolve, { once: true });
                });
                
                // Stop recording
                loadingIndicator.textContent = "Processing video...";
                const frames = visualizer.stopRecording();
                
                if (frames.length === 0) {
                    throw new Error("No frames were captured during recording");
                }
                
                console.log(`Captured ${frames.length} frames, exporting video...`);
                
                // Export video
                const videoUrl = await visualizer.exportVideo(frames, 30, format);
                
                // Create download link
                const a = document.createElement('a');
                a.href = videoUrl;
                a.download = `music-viz-${new Date().getTime()}.${format}`;
                a.click();
                
                // Clean up
                URL.revokeObjectURL(videoUrl);
                
                // Update UI
                loadingIndicator.textContent = "Export complete!";
                setTimeout(() => {
                    loadingIndicator.classList.add('hidden');
                }, 2000);
                
            }, 500);
            
        } catch (error) {
            console.error('Error exporting video:', error);
            alert('Failed to export video: ' + error.message);
            loadingIndicator.classList.add('hidden');
        }
    });
});