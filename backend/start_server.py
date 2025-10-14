#!/usr/bin/env python3
"""
Startup script for Advanced Whisper Diarization Server
Automatically installs dependencies and starts the server
"""

import os
import sys
import subprocess
import pkg_resources
from pathlib import Path

def check_python_version():
    """Check if Python version is compatible"""
    if sys.version_info < (3, 8):
        print("❌ Python 3.8 or higher is required")
        print(f"Current version: {sys.version}")
        sys.exit(1)
    else:
        print(f"✅ Python version: {sys.version.split()[0]}")

def install_requirements():
    """Install required packages"""
    requirements_file = Path(__file__).parent / 'requirements.txt'
    
    if not requirements_file.exists():
        print("❌ requirements.txt not found")
        sys.exit(1)
    
    print("📦 Installing dependencies...")
    try:
        subprocess.check_call([
            sys.executable, '-m', 'pip', 'install', '-r', str(requirements_file)
        ])
        print("✅ Dependencies installed successfully")
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install dependencies: {e}")
        print("Try running: pip install -r requirements.txt")
        sys.exit(1)

def check_dependencies():
    """Check if all required packages are installed"""
    required_packages = [
        'torch', 'torchaudio', 'whisper', 'librosa', 'numpy',
        'fastapi', 'uvicorn', 'soundfile', 'scipy'
    ]
    
    missing_packages = []
    
    for package in required_packages:
        try:
            pkg_resources.get_distribution(package)
        except pkg_resources.DistributionNotFound:
            missing_packages.append(package)
    
    if missing_packages:
        print(f"❌ Missing packages: {', '.join(missing_packages)}")
        print("Installing missing dependencies...")
        install_requirements()
    else:
        print("✅ All required dependencies are installed")

def check_gpu():
    """Check GPU availability"""
    try:
        import torch
        if torch.cuda.is_available():
            gpu_count = torch.cuda.device_count()
            gpu_name = torch.cuda.get_device_name(0)
            print(f"🚀 GPU available: {gpu_name} ({gpu_count} device(s))")
            print("🔥 CUDA acceleration will be used for faster processing")
        else:
            print("⚠️ No GPU detected. Using CPU (slower but still works)")
    except ImportError:
        print("⚠️ PyTorch not installed yet")

def start_server():
    """Start the diarization server"""
    server_file = Path(__file__).parent / 'whisper_diarization_server.py'
    
    if not server_file.exists():
        print("❌ Server file not found: whisper_diarization_server.py")
        sys.exit(1)
    
    print("🚀 Starting Advanced Whisper Diarization Server...")
    print("🌐 Server will be available at: http://localhost:8000")
    print("📊 Health check: http://localhost:8000/health")
    print("📖 API docs: http://localhost:8000/docs")
    print("")
    print("Press Ctrl+C to stop the server")
    print("=" * 50)
    
    try:
        os.chdir(Path(__file__).parent)
        subprocess.call([sys.executable, 'whisper_diarization_server.py'])
    except KeyboardInterrupt:
        print("\n👋 Server stopped by user")
    except Exception as e:
        print(f"❌ Server error: {e}")

def main():
    """Main startup function"""
    print("🎯 Advanced Whisper Diarization Server Startup")
    print("=" * 50)
    
    # Check system requirements
    check_python_version()
    check_gpu()
    
    # Install/check dependencies
    try:
        check_dependencies()
    except Exception as e:
        print(f"❌ Dependency check failed: {e}")
        print("Trying to install requirements...")
        install_requirements()
    
    # Start the server
    start_server()

if __name__ == "__main__":
    main()