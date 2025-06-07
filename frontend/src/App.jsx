import React, { useEffect, useRef, useState } from 'react';


function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [qrResults, setQrResults] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment');
  const [debugLogs, setDebugLogs] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
  const API_URL = import.meta.env.VITE_API_URL;

  useEffect(() => {
    // Stop any existing tracks
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }

    // Start webcam with constraints
    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    })
    .then((stream) => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    })
    .catch((err) => {
      console.error("Camera error:", err);
      setError("Failed to access camera: " + err.message);
    });

    const interval = setInterval(captureFrame, 1000);
    return () => {
      clearInterval(interval);
      videoRef.current?.srcObject?.getTracks().forEach(track => track.stop());
    };
  }, [facingMode]);

  useEffect(() => {
    addDebugLog(`Frontend running locally at: ${window.location.origin}`);
    addDebugLog(`Backend API: ${API_URL}`);
  }, [API_URL]);

  useEffect(() => {
    if (canvasRef.current && videoRef.current) {
      const canvas = canvasRef.current;
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (qrResults.length > 0) {
        qrResults.forEach(qr => {
          if (qr.polygon) {
            // Draw polygon
            ctx.beginPath();
            ctx.moveTo(qr.polygon[0][0], qr.polygon[0][1]);
            qr.polygon.forEach((point, index) => {
              if (index > 0) ctx.lineTo(point[0], point[1]);
            });
            ctx.lineTo(qr.polygon[0][0], qr.polygon[0][1]);
            
            // Styling
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = 4;
            ctx.stroke();

            // Draw corner markers
            qr.polygon.forEach(point => {
              ctx.beginPath();
              ctx.arc(point[0], point[1], 8, 0, 2 * Math.PI);
              ctx.fillStyle = '#FF0000';
              ctx.fill();
            });

            // Add label
            const label = `${qr.type}: ${qr.data}`;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(qr.rect.x, qr.rect.y - 30, ctx.measureText(label).width + 20, 25);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '16px Arial';
            ctx.fillText(label, qr.rect.x + 10, qr.rect.y - 10);
          }
        });
      }
    }
  }, [qrResults]);

  const addDebugLog = (message) => {
    setDebugLogs(prev => [...prev.slice(-4), message]); // Keep last 5 logs
  };

  const captureFrame = async () => {
    if (!videoRef.current || !videoRef.current.videoWidth) {
      addDebugLog('Video not ready yet');
      return;
    }

    setIsScanning(true);
    setError(null);
    
    try {
      const canvas = document.createElement("canvas");
      const videoWidth = videoRef.current.videoWidth;
      const videoHeight = videoRef.current.videoHeight;
      
      addDebugLog(`Video: ${videoWidth}x${videoHeight}`);
      
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      
      const ctx = canvas.getContext("2d");
      ctx.drawImage(videoRef.current, 0, 0);
      const imageData = canvas.toDataURL("image/jpeg");
      
      addDebugLog(`Image size: ${Math.round(imageData.length / 1024)}KB`);
      
      addDebugLog(`Attempting to fetch: ${API_URL}/scan`);
      const response = await fetch(`${API_URL}/scan`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ image: imageData })
      });
      
      addDebugLog(`Response status: ${response.status}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Server response data:', data);
      
      if (data.length > 0) {
        console.log('QR codes found:', data.length);
        setQrResults(data); // Store the complete QR data objects
      } else {
        setQrResults([]); // Clear results when no QR codes are found
      }
    } catch (err) {
      addDebugLog(`Network Error: ${err.message}`);
      setError(`Connection failed: ${err.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh',
      background: '#f0f2f5',
      padding: '1rem'
    }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
        background: 'white',
        borderRadius: '12px',
        padding: '2rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{ 
          color: '#1a1a1a',
          fontSize: '1.8rem',
          marginBottom: '2rem'
        }}>📷 QR Code Scanner</h1>

        <button 
          onClick={() => setFacingMode(current => current === 'environment' ? 'user' : 'environment')}
          style={{
            background: '#007AFF',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '8px',
            fontSize: '1rem',
            cursor: 'pointer',
            marginBottom: '1rem'
          }}
        >
          Switch Camera ({facingMode === 'environment' ? 'Back' : 'Front'})
        </button>

        <div style={{ 
          position: 'relative',
          width: '100%',
          maxWidth: '600px',
          margin: '1rem auto',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }}>
          <video 
            ref={videoRef} 
            style={{ width: '100%', display: 'block', borderRadius: '12px' }} 
            autoPlay 
            playsInline 
            muted 
          />
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none'
            }}
          />
          {isScanning && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(0,0,0,0.7)',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '0.9rem'
            }}>
              Scanning...
            </div>
          )}
        </div>

        <div style={{
          background: '#f8f9fa',
          padding: '1rem',
          borderRadius: '8px',
          marginTop: '1rem'
        }}>
          <h3 style={{ margin: '0 0 1rem 0', color: '#2c3e50' }}>Detected QR Codes:</h3>
          {error && (
            <div style={{ 
              color: '#dc3545',
              background: '#ffe6e6',
              padding: '0.5rem',
              borderRadius: '4px',
              marginBottom: '1rem'
            }}>
              {error}
            </div>
          )}
          {qrResults.map((qr, idx) => (
            <div 
              key={idx}
              style={{
                background: '#e9ecef',
                padding: '0.75rem',
                borderRadius: '6px',
                marginBottom: '0.5rem',
                wordBreak: 'break-all'
              }}
            >
              <div>Type: {qr.type}</div>
              <div>Data: {qr.data}</div>
            </div>
          ))}
          {qrResults.length === 0 && !error && (
            <p style={{ color: '#6c757d' }}>No QR codes detected yet</p>
          )}
        </div>

        <button
          onClick={() => setShowDebug(prev => !prev)}
          style={{
            background: 'transparent',
            border: '1px solid #dee2e6',
            padding: '8px 16px',
            borderRadius: '6px',
            marginTop: '1rem',
            cursor: 'pointer'
          }}
        >
          {showDebug ? 'Hide Debug Info' : 'Show Debug Info'}
        </button>
      </div>

      {showDebug && (
        <div style={{ 
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'rgba(0,0,0,0.9)',
          color: 'white',
          padding: '1rem',
          fontSize: '0.875rem',
          fontFamily: 'monospace',
          maxHeight: '30vh',
          overflowY: 'auto'
        }}>
          <h4 style={{ margin: '0 0 0.5rem 0' }}>Debug Logs:</h4>
          {debugLogs.map((log, idx) => (
            <div key={idx} style={{ opacity: 0.8 }}>{log}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
