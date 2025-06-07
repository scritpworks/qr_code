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
  const MIN_PROCESS_INTERVAL = 50; 
  const animationFrameRef = useRef(null);
  const lastPositionsRef = useRef(new Map()); 
  const scannerRef = useRef(null);

  useEffect(() => {
   
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }

   
    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: facingMode,
        width: { ideal: 1280 },  // Back to higher resolution
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      }
    })
    .then((stream) => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();  // Ensure video plays
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
      const ctx = canvas.getContext('2d');
      let animationFrame;
      
      const drawScanner = (timestamp) => {
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);

        // Draw scanning grid
        ctx.strokeStyle = 'rgba(0, 255, 136, 0.2)';
        const gridSize = 40;
        for (let x = 0; x < width; x += gridSize) {
          for (let y = 0; y < height; y += gridSize) {
            ctx.beginPath();
            ctx.rect(x, y, gridSize, gridSize);
            ctx.stroke();
          }
        }

        // Animated scan line
        const scanY = ((timestamp % 3000) / 3000) * height;
        const gradient = ctx.createLinearGradient(0, scanY - 10, 0, scanY + 10);
        gradient.addColorStop(0, 'rgba(0, 255, 136, 0)');
        gradient.addColorStop(0.5, 'rgba(0, 255, 136, 0.8)');
        gradient.addColorStop(1, 'rgba(0, 255, 136, 0)');
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, scanY);
        ctx.lineTo(width, scanY);
        ctx.stroke();

        // Draw QR markers
        if (qrResults.length > 0) {
          qrResults.forEach(qr => {
            if (qr.polygon) {
              const scaleX = width / videoRef.current.videoWidth;
              const scaleY = height / videoRef.current.videoHeight;
              
              // Draw targeting box
              ctx.beginPath();
              ctx.moveTo(qr.polygon[0][0] * scaleX, qr.polygon[0][1] * scaleY);
              qr.polygon.forEach(point => {
                ctx.lineTo(point[0] * scaleX, point[1] * scaleY);
              });
              ctx.closePath();
              
              // Glowing effect
              ctx.shadowColor = '#00ff88';
              ctx.shadowBlur = 15;
              ctx.strokeStyle = '#00ff88';
              ctx.lineWidth = 2;
              ctx.stroke();
              
              // Corner markers
              qr.polygon.forEach(point => {
                const x = point[0] * scaleX;
                const y = point[1] * scaleY;
                
                // Cross
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x - 10, y);
                ctx.lineTo(x + 10, y);
                ctx.moveTo(x, y - 10);
                ctx.lineTo(x, y + 10);
                ctx.stroke();
                
                // Dot
                ctx.fillStyle = '#ff0000';
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fill();
              });
            }
          });
        }

        animationFrame = requestAnimationFrame(drawScanner);
      };

      animationFrame = requestAnimationFrame(drawScanner);
      return () => cancelAnimationFrame(animationFrame);
    }
  }, [qrResults]);

  useEffect(() => {
    if (canvasRef.current && videoRef.current) {
      const canvas = canvasRef.current;
      const displayWidth = videoRef.current.clientWidth;
      const displayHeight = videoRef.current.clientHeight;
      
      canvas.width = displayWidth;
      canvas.height = displayHeight;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (qrResults.length > 0) {
        const scaleX = displayWidth / videoRef.current.videoWidth;
        const scaleY = displayHeight / videoRef.current.videoHeight;

        qrResults.forEach(qr => {
          if (qr.polygon) {
            const scaledPolygon = qr.polygon.map(point => ({
              x: point[0] * scaleX,
              y: point[1] * scaleY
            }));

            // Draw boundary
            ctx.beginPath();
            ctx.moveTo(scaledPolygon[0].x, scaledPolygon[0].y);
            scaledPolygon.forEach(point => ctx.lineTo(point.x, point.y));
            ctx.closePath();
            
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Draw label
            const label = qr.data;
            ctx.fillStyle = 'rgba(0, 20, 40, 0.9)';
            ctx.fillRect(
              scaledPolygon[0].x,
              scaledPolygon[0].y - 25,
              ctx.measureText(label).width + 20,
              25
            );
            
            ctx.fillStyle = '#00ff88';
            ctx.font = '14px monospace';
            ctx.fillText(
              label,
              scaledPolygon[0].x + 10,
              scaledPolygon[0].y - 8
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

    processingRef.current = true;
    setIsScanning(true);
    
    try {
      const canvas = document.createElement("canvas");
      const videoWidth = videoRef.current.videoWidth;
      const videoHeight = videoRef.current.videoHeight;
      
      canvas.width = videoWidth;  // Use full resolution
      canvas.height = videoHeight;
      
      const ctx = canvas.getContext("2d");
      ctx.drawImage(videoRef.current, 0, 0);
      const imageData = canvas.toDataURL("image/jpeg", 0.8);
      
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
      setIsScanning(false);
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
