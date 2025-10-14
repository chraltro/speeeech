#!/usr/bin/env python3
"""
Startup script for Simple Whisper Server - Reliable and stable
"""

import os
import sys
import subprocess
from pathlib import Path

def install_simple_requirements():
    """Install minimal requirements for simple server"""
    requirements = [
        "torch",
        "openai-whisper", 
        "librosa",
        "numpy",
        "fastapi",
        "uvicorn[standard]",
        "python-multipart"
    ]
    
    print("📦 Installing minimal requirements for simple server...")
    
    for package in requirements:
        try:
            print(f"  Installing {package}...")
            subprocess.check_call([
                sys.executable, '-m', 'pip', 'install', package
            ], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        except subprocess.CalledProcessError as e:
            print(f"  ⚠️ Failed to install {package}: {e}")
            
    print("✅ Installation complete!")

def main():
    print("🚀 Simple Whisper Server Startup")
    print("=" * 40)
    print("🎯 Optimized for reliability and stability")
    print("📱 Works great for conversational audio")
    print("💡 Uses CPU-only for maximum compatibility")
    print("")
    
    # Check Python version
    if sys.version_info < (3, 8):
        print("❌ Python 3.8+ required")
        return
    
    # Install requirements
    try:
        install_simple_requirements()
    except Exception as e:
        print(f"❌ Installation failed: {e}")
        print("Try running manually: pip install torch openai-whisper librosa numpy fastapi uvicorn python-multipart")
        return
    
    # Start server
    server_file = Path(__file__).parent / 'simple_whisper_server.py'
    
    print("🚀 Starting Simple Whisper Server...")
    print("🌐 Will be available at: http://localhost:8000")
    print("📊 Health check: http://localhost:8000/health")
    print("")
    print("💡 This server uses:")
    print("  • Whisper 'base' model (fast & reliable)")  
    print("  • CPU processing (stable)")
    print("  • Simple pause-based diarization")
    print("  • Works great for conversations/interviews")
    print("")
    print("Press Ctrl+C to stop")
    print("=" * 40)
    
    try:
        os.chdir(Path(__file__).parent)
        subprocess.call([sys.executable, 'simple_whisper_server.py'])
    except KeyboardInterrupt:
        print("\n👋 Server stopped")
    except Exception as e:
        print(f"❌ Server error: {e}")

if __name__ == "__main__":
    main()