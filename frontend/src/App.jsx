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
  const [scanCount, setScanCount] = useState(0);
  const [lastScan, setLastScan] = useState(null);
  const API_URL = import.meta.env.VITE_API_URL;
  const processingRef = useRef(false);
  const lastProcessedRef = useRef(0);
  const MIN_PROCESS_INTERVAL = 50; // Reduced from 100ms to 50ms
  const FRAME_SKIP = 2; // Process every 2nd frame
  const animationFrameRef = useRef(null);
  const lastPositionsRef = useRef(new Map()); 
  const frameCountRef = useRef(0);

  useEffect(() => {
   
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }

   
    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: facingMode,
        width: { ideal: 640 }, // Reduced from 1280
        height: { ideal: 480 }, // Reduced from 720
        frameRate: { ideal: 30 }
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

    const processFrame = async () => {
      if (!processingRef.current) {
        await captureFrame();
      }
      animationFrameRef.current = requestAnimationFrame(processFrame);
    };

    processFrame();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
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
      const displayWidth = videoRef.current.clientWidth;
      const displayHeight = videoRef.current.clientHeight;
      
      canvas.width = displayWidth;
      canvas.height = displayHeight;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Scanner grid effect
      const gridSize = 30;
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.2)';
      ctx.lineWidth = 1;
      
      // Draw vertical and horizontal grid lines
      for (let i = 0; i < canvas.width; i += gridSize) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
      }
      for (let i = 0; i < canvas.height; i += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
      }

      if (qrResults.length > 0) {
        // Fix scaling calculation
        const scaleX = displayWidth / (videoRef.current.videoWidth / 4); // Match the capture size
        const scaleY = displayHeight / (videoRef.current.videoHeight / 4);

        qrResults.forEach(qr => {
          if (qr.polygon) {
            const scaledPolygon = qr.polygon.map(point => ({
              x: point[0] * scaleX,
              y: point[1] * scaleY
            }));

            // Draw QR boundary
            ctx.beginPath();
            ctx.moveTo(scaledPolygon[0].x, scaledPolygon[0].y);
            scaledPolygon.forEach(point => ctx.lineTo(point.x, point.y));
            ctx.closePath();
            
            // Enhanced neon effect
            ctx.shadowColor = '#00ff88';
            ctx.shadowBlur = 20;
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Digital label
            const label = `${qr.data}`;
            ctx.font = '16px "Share Tech Mono"';
            const textWidth = ctx.measureText(label).width;
            
            // Draw label background
            ctx.fillStyle = 'rgba(0, 20, 40, 0.95)';
            ctx.fillRect(
              scaledPolygon[0].x,
              scaledPolygon[0].y - 30,
              textWidth + 20,
              25
            );
            
            // Draw label text
            ctx.fillStyle = '#00ff88';
            ctx.fillText(
              label,
              scaledPolygon[0].x + 10,
              scaledPolygon[0].y - 12
            );
          }
        });
      }
    }
  }, [qrResults]);

  const addDebugLog = (message) => {
    setDebugLogs(prev => [...prev.slice(-4), message]); // Keep last 5 logs
  };

  const captureFrame = async () => {
    if (!videoRef.current?.videoWidth || processingRef.current) {
      return;
    }

    // Skip frames for better performance
    frameCountRef.current += 1;
    if (frameCountRef.current % FRAME_SKIP !== 0) {
      return;
    }

    processingRef.current = true;
    
    try {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth / 4;
      canvas.height = videoRef.current.videoHeight / 4;
      
      const ctx = canvas.getContext("2d", {
        alpha: false,
        willReadFrequently: true
      });
      
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const imageData = canvas.toDataURL("image/jpeg", 0.7);
      
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
      processingRef.current = false;
      requestAnimationFrame(captureFrame); // Immediate next frame request
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh',
      background: '#000913',
      padding: '1rem',
      color: '#00ff88',
      fontFamily: '"Share Tech Mono", monospace'
    }}>
      <div style={{
        maxWidth: '900px',
        margin: '0 auto',
        background: 'rgba(0, 20, 40, 0.8)',
        borderRadius: '8px',
        padding: '2rem',
        border: '1px solid #00ff88',
        boxShadow: '0 0 30px rgba(0, 255, 136, 0.2)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
          padding: '1rem',
          background: 'rgba(0, 40, 60, 0.5)',
          borderRadius: '4px'
        }}>
          <div>
            <h1 style={{ 
              color: '#00ff88',
              fontSize: '2rem',
              textShadow: '0 0 10px rgba(0, 255, 136, 0.5)',
              margin: 0,
              letterSpacing: '2px'
            }}>STUDENT VERIFICATION SYSTEM</h1>
            <div style={{ color: '#0cf', fontSize: '0.9rem', marginTop: '0.5rem' }}>
              {new Date().toLocaleDateString()} • ACTIVE SCAN
            </div>
          </div>
          <div style={{
            background: 'rgba(0, 40, 20, 0.9)',
            padding: '1rem',
            borderRadius: '4px',
            border: '1px solid #00ff88',
            minWidth: '150px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.8rem', color: '#0cf' }}>VERIFIED</div>
            <div style={{ 
              fontSize: '2rem',
              fontWeight: 'bold',
              textShadow: '0 0 10px rgba(0, 255, 136, 0.5)'
            }}>{scanCount}</div>
          </div>
        </div>

        <div style={{ 
          position: 'relative',
          width: '100%',
          maxWidth: '700px',
          margin: '1rem auto',
          borderRadius: '8px',
          overflow: 'hidden',
          border: '2px solid #00ff88',
          boxShadow: '0 0 30px rgba(0, 255, 136, 0.2)'
        }}>
          <video 
            ref={videoRef} 
            style={{ 
              width: '100%', 
              display: 'block', 
              borderRadius: '8px',
              filter: 'contrast(1.1) brightness(1.1)'
            }} 
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
              bottom: '1rem',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(0, 40, 20, 0.9)',
              color: '#00ff88',
              padding: '0.5rem 2rem',
              borderRadius: '20px',
              fontSize: '0.9rem',
              border: '1px solid #00ff88',
              animation: 'pulse 2s infinite',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <div className="scanner-dot" /> SCANNING
            </div>
          )}
        </div>

        <div style={{
          background: 'rgba(0, 20, 30, 0.8)',
          padding: '1.5rem',
          borderRadius: '8px',
          marginTop: '1rem',
          border: '1px solid #00ff88'
        }}>
          <h3 style={{ 
            margin: '0 0 1rem 0', 
            color: '#0cf',
            borderBottom: '1px solid #00ff88',
            paddingBottom: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span className="icon">⚡</span> VERIFICATION LOG
          </h3>
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

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .scanner-dot {
          width: 8px;
          height: 8px;
          background: #00ff88;
          border-radius: 50%;
          animation: pulse 1s infinite;
        }
        .icon {
          color: #0cf;
        }
      `}</style>
    </div>
  );
}

export default App;
