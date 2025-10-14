# Speeeech - AI-Powered Transcription with Speaker Identification

A modern React application featuring professional audio transcription with speaker diarization using OpenAI Whisper, AssemblyAI, and advanced AI post-processing.

## ✨ Features

### 📝 Transcription Studio
- **Speaker Diarization** - Automatically identify and separate multiple speakers using AssemblyAI
- **Speaker Statistics** - Detailed analytics showing talk time, word count, and participation percentages
- **File upload transcription** - Support for MP3, WAV, M4A, MP4, MPEG, MPGA, WEBM (up to 25MB)
- **Live audio recording** with real-time transcription
- **Word-level timestamps** for precise editing and analysis
- **AI-powered post-processing** with Gemini Flash 2.5:
  - Smart formatting and structure improvements
  - Transcription error correction
  - Automatic filler word removal (uh, um, you know, etc.)
- **Multiple export formats** - TXT, JSON, and SRT subtitle files
- **Interactive speaker timeline** with color-coded segments

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ and npm
- OpenAI API key (for basic transcription)
- AssemblyAI API key (for speaker diarization)
- Google Gemini API key (for AI post-processing)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd speeeech
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your API keys:
   ```env
   REACT_APP_OPENAI_API_KEY=your_openai_api_key_here
   REACT_APP_ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here
   REACT_APP_GEMINI_API_KEY=your_gemini_api_key_here
   ```

4. **Start the development server**
   ```bash
   npm start
   ```

5. **Open your browser**
   Navigate to `http://localhost:3000`

## 🔑 API Keys Setup

### OpenAI API Key
1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create an account or sign in
3. Generate a new API key
4. Add it to your `.env` file as `REACT_APP_OPENAI_API_KEY`

### AssemblyAI API Key  
1. Visit [AssemblyAI](https://www.assemblyai.com/app/)
2. Create an account and get your API key
3. Add it to your `.env` file as `REACT_APP_ASSEMBLYAI_API_KEY`

### Google Gemini API Key
1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key
3. Add it to your `.env` file as `REACT_APP_GEMINI_API_KEY`

### Firebase (Optional)
If you want to save conversation sessions:
1. Create a Firebase project
2. Enable Firestore Database
3. Add your Firebase config to `.env`

## 🎯 Usage Guide

### Transcription Studio
1. Click "Start Transcribing" from the home page
2. Choose "Upload File" or "Record Audio"
3. For uploads: drag & drop or click to select audio files
4. For recording: click record and speak (auto-stops or manual stop)
5. Choose your transcription type:
   - **Basic** - Simple text transcription
   - **Timestamps** - Word-level timing information
   - **Speakers** - Full speaker diarization (identifies who said what)
6. For speaker diarization, set expected number of speakers (2-10)
7. Optionally enable AI post-processing:
   - ✅ Improve formatting and structure
   - ✅ Correct transcription errors  
   - ✅ Remove filler words
8. Download results in multiple formats (TXT, JSON, SRT)

## 🛠️ Technology Stack

- **Frontend**: React 18, Tailwind CSS, Lucide React Icons
- **Speech Recognition**: OpenAI Whisper API
- **Speaker Diarization**: AssemblyAI API
- **AI Processing**: Google Gemini Flash 2.5
- **Audio Processing**: Web Audio API, MediaRecorder
- **Storage**: Firebase Firestore (optional)
- **Build Tool**: Create React App

## ⚙️ Configuration Options

### Transcription Settings
- **Basic Transcription**: OpenAI Whisper-1 (optimized for accuracy)
- **Speaker Diarization**: AssemblyAI with configurable speaker count (2-10)
- **Languages**: Auto-detection for both services
- **Output Formats**: TXT, JSON, SRT subtitles
- **Post-processing**: Multiple AI enhancement options with Gemini

## 📊 API Usage & Costs

### OpenAI Pricing (as of 2024)
- **Whisper**: $0.006 per minute of audio

### AssemblyAI Pricing (as of 2024)
- **Speaker Diarization**: $0.37 per hour of audio processed
- **Free tier**: $50 in credits to get started

### Gemini Flash 2.5 Pricing
- **Text Generation**: Free tier available, then pay-as-you-go

### Usage Tips
- AssemblyAI offers better value for speaker diarization than OpenAI alternatives
- Use shorter audio files to minimize costs across all services
- Post-processing is optional to control Gemini usage
- Consider the tradeoff: basic transcription is cheaper, speaker identification adds significant value

## 🔧 Development

### Project Structure
```
src/
├── components/
│   └── TranscriptionStudio.js     # Main transcription interface
├── hooks/
│   └── useWhisperRecognition.js   # Whisper-based speech recognition
├── services/
│   ├── openaiService.js           # OpenAI Whisper API
│   ├── assemblyaiService.js       # AssemblyAI speaker diarization
│   ├── geminiService.js           # Google Gemini integration
│   └── firebaseService.js         # Session storage (optional)
└── App.js                         # Main app with navigation
```

### Available Scripts
- `npm start` - Development server
- `npm run build` - Production build
- `npm test` - Run tests
- `npm run eject` - Eject from Create React App

## 🔒 Security & Privacy

- API keys are stored in environment variables
- Audio processing happens client-side when possible
- No audio data is stored permanently without explicit user action
- Firebase sessions are optional and user-controlled

## 🐛 Troubleshooting

### Common Issues

**Microphone not working**
- Check browser permissions
- Ensure HTTPS (required for microphone access)
- Try refreshing the page

**API errors**
- Verify API keys in `.env` file
- Check API quota limits
- Ensure proper formatting of environment variables

**Audio playback issues**
- Check browser audio permissions
- Verify volume settings
- Try different browsers (Chrome recommended)

**Large file uploads**
- Files must be under 25MB for Whisper
- Convert to supported formats: MP3, WAV, M4A, MP4, MPEG, MPGA, WEBM

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🙏 Acknowledgments

- OpenAI for Whisper and TTS APIs
- Google for Gemini AI models
- React and the open-source community
- All contributors and testers

---

**Built with ❤️ using modern web technologies**