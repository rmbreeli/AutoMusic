class AudioAnalyzer {
    constructor() {
        this.audioContext = null;
        this.source = null;
        this.audioBuffer = null;
        this.analyser = null;
        this.gainNode = null;
        this.isPlaying = false;
        this.frequencyData = null;
        this.timeData = null;
        this.beatDetectionData = {
            threshold: 0.15,
            decay: 0.98,
            beatCutOff: 0,
            beatTime: 0,
            isBeat: false
        };
        this.tempoData = {
            bpm: 0,
            confidence: 0
        };
        
        // For beat detection
        this.previousLevels = [];
        this.levelHistory = Array(60).fill(0);
    }
    
    async loadAudio(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async (event) => {
                try {
                    // Initialize Audio Context (must be done after user interaction)
                    if (!this.audioContext) {
                        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    }
                    
                    // Decode audio data
                    const arrayBuffer = event.target.result;
                    this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                    
                    // Set up audio nodes
                    this.analyser = this.audioContext.createAnalyser();
                    this.analyser.fftSize = 2048;
                    this.gainNode = this.audioContext.createGain();
                    
                    // Connect nodes
                    this.analyser.connect(this.gainNode);
                    this.gainNode.connect(this.audioContext.destination);
                    
                    // Initialize data arrays
                    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
                    this.timeData = new Uint8Array(this.analyser.frequencyBinCount);
                    
                    resolve(this.audioBuffer);
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = (error) => reject(error);
            reader.readAsArrayBuffer(file);
        });
    }
    
    play() {
        if (this.isPlaying) this.stop();
        
        this.source = this.audioContext.createBufferSource();
        this.source.buffer = this.audioBuffer;
        this.source.connect(this.analyser);
        
        this.source.start(0);
        this.isPlaying = true;
        
        this.source.onended = () => {
            this.isPlaying = false;
        };
    }
    
    stop() {
        if (this.source) {
            this.source.stop(0);
            this.source.disconnect();
        }
        this.isPlaying = false;
    }
    
    analyzeAudio() {
        // Get frequency data
        this.analyser.getByteFrequencyData(this.frequencyData);
        
        // Get time domain data
        this.analyser.getByteTimeDomainData(this.timeData);
        
        // Detect beats
        this.detectBeats();
        
        // Estimate tempo
        this.estimateTempo();
        
        return {
            frequencyData: this.frequencyData,
            timeData: this.timeData,
            beatDetection: this.beatDetectionData,
            tempo: this.tempoData
        };
    }
    
    detectBeats() {
        // Calculate average frequency magnitude
        let sum = 0;
        for (let i = 0; i < this.frequencyData.length; i++) {
            sum += this.frequencyData[i];
        }
        const average = sum / this.frequencyData.length;
        
        // Update level history
        this.levelHistory.shift();
        this.levelHistory.push(average);
        
        // Calculate level average
        let levelSum = 0;
        for (let i = 0; i < this.levelHistory.length; i++) {
            levelSum += this.levelHistory[i];
        }
        const levelAverage = levelSum / this.levelHistory.length;
        
        // Beat detection
        if (average > this.beatDetectionData.beatCutOff && average > levelAverage * 1.5) {
            this.beatDetectionData.isBeat = true;
            this.beatDetectionData.beatCutOff = average * 1.1;
            this.beatDetectionData.beatTime = 0;
        } else {
            this.beatDetectionData.isBeat = false;
            if (this.beatDetectionData.beatTime <= 60) {
                this.beatDetectionData.beatTime++;
            } else {
                this.beatDetectionData.beatCutOff *= this.beatDetectionData.decay;
                this.beatDetectionData.beatCutOff = Math.max(this.beatDetectionData.beatCutOff, levelAverage * 0.5);
            }
        }
    }
    
    estimateTempo() {
        // This is a simplified tempo detection algorithm
        // More sophisticated algorithms would involve autocorrelation
        
        // Count beats over time to estimate BPM
        if (this.beatDetectionData.isBeat) {
            this.previousLevels.push(performance.now());
            
            // Only keep the last 10 seconds of beat data
            const tenSecondsAgo = performance.now() - 10000;
            this.previousLevels = this.previousLevels.filter(time => time > tenSecondsAgo);
            
            if (this.previousLevels.length > 5) {
                // Calculate intervals between beats
                const intervals = [];
                for (let i = 1; i < this.previousLevels.length; i++) {
                    intervals.push(this.previousLevels[i] - this.previousLevels[i-1]);
                }
                
                // Calculate average interval
                const averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
                
                // Convert to BPM
                this.tempoData.bpm = Math.round(60000 / averageInterval);
                
                // Calculate confidence based on consistency of intervals
                const deviation = intervals.reduce((sum, interval) => sum + Math.abs(interval - averageInterval), 0) / intervals.length;
                this.tempoData.confidence = Math.max(0, 1 - (deviation / averageInterval));
            }
        }
    }
    
    getFrequencyBand(band) {
        // Get specific frequency bands
        // Low (bass): 20-250Hz
        // Mid (vocals/instruments): 250-4000Hz
        // High (cymbals/hats): 4000-20000Hz
        
        const binSize = this.audioContext.sampleRate / (this.analyser.frequencyBinCount * 2);
        
        let startBin, endBin;
        
        switch(band) {
            case 'low':
                startBin = Math.floor(20 / binSize);
                endBin = Math.floor(250 / binSize);
                break;
            case 'mid':
                startBin = Math.floor(250 / binSize);
                endBin = Math.floor(4000 / binSize);
                break;
            case 'high':
                startBin = Math.floor(4000 / binSize);
                endBin = Math.floor(20000 / binSize);
                break;
            default:
                startBin = 0;
                endBin = this.frequencyData.length - 1;
        }
        
        startBin = Math.max(0, startBin);
        endBin = Math.min(this.frequencyData.length - 1, endBin);
        
        let sum = 0;
        for (let i = startBin; i <= endBin; i++) {
            sum += this.frequencyData[i];
        }
        
        return sum / (endBin - startBin + 1) / 255; // Normalize to 0-1
    }
}