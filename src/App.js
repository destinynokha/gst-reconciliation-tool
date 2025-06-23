import React, { useState, useEffect } from 'react';

function App() {
  // State management
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedUser, setSelectedUser] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const [reconciliationType, setReconciliationType] = useState('daily');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [uploadedFiles, setUploadedFiles] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [reconciliationResults, setReconciliationResults] = useState(null);
  const [error, setError] = useState('');

  const users = ['Vinita', 'Laxmi', 'Geetanshu', 'Anil'];
  const googleScriptUrl = process.env.REACT_APP_GOOGLE_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbya12qFbb91AK_FQO--zdZ-CWnBrywdwEQqqW_frjVfaIuhTH89Gc_b3AAIREXZMRIA/exec';

  // Check connection on component mount
  useEffect(() => {
    checkConnection();
  }, []);

  // File processing utilities (integrated directly)
  const processFiles = async (files, reconciliationType) => {
    try {
      console.log('📁 Processing uploaded files...');
      
      const processedData = {
        ims: [],
        gstr2a: [],
        gstr2b: [],
        purchaseRegister: [],
        logitaxPurchase: [],
        fileInfo: []
      };

      let hasProcessedData = false;

      // Process each uploaded file
      for (const [fileType, file] of Object.entries(files)) {
        if (!file) continue;

        console.log(`📊 Analyzing ${fileType}: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);

        // Store file information
        processedData.fileInfo.push({
          type: fileType,
          name: file.name,
          size: file.size,
          lastModified: new Date(file.lastModified).toLocaleString(),
          mimeType: file.type,
          status: 'File recognized but processing not implemented'
        });

        try {
          // Attempt to read file content
          const fileContent = await readFileContent(file, fileType);
          
          // Real file processing would go here
          // For now, we acknowledge the file but don't create fake data
          console.log(`✅ File ${file.name} read successfully, but processing libraries not available in this environment`);
          
        } catch (fileError) {
          console.error(`❌ Error reading ${fileType}:`, fileError);
          processedData.fileInfo[processedData.fileInfo.length - 1].status = `Error: ${fileError.message}`;
        }
      }

      // Check if we have any actual data to process
      const totalRecords = processedData.ims.length + 
                          processedData.gstr2a.length + 
                          processedData.gstr2b.length + 
                          processedData.purchaseRegister.length + 
                          processedData.logitaxPurchase.length;

      if (totalRecords === 0) {
        return {
          success: false,
          error: 'No data could be extracted from uploaded files. This demo environment requires ExcelJS and JSZip libraries for actual file processing. Please deploy to your local environment for full functionality.',
          data: processedData,
          filesProcessed: Object.keys(files).length
        };
      }

      return {
        success: true,
        data: processedData,
        processedAt: new Date().toISOString(),
        filesProcessed: Object.keys(files).length
      };

    } catch (error) {
      console.error('❌ File processing failed:', error);
      return {
        success: false,
        error: `File processing failed: ${error.message}. Real file processing requires ExcelJS and JSZip libraries in your local environment.`
      };
    }
  };

  // Read file content
  const readFileContent = async (file, fileType) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        // File is read but we can't process it without proper libraries
        resolve(e.target.result);
      };
      
      reader.onerror = (e) => {
        reject(new Error(`Failed to read ${fileType} file: ${file.name}`));
      };

      // Read based on file type
      if (fileType === 'ims' && file.name.endsWith('.zip')) {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    });
  };

  // Validate uploaded file
  const validateFile = (file, expectedType) => {
    const errors = [];

    // Check file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      errors.push('File size exceeds 50MB limit');
    }

    // Check file type
    const fileName = file.name.toLowerCase();
    if (expectedType === 'excel' && !fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      errors.push('Please upload an Excel file (.xlsx or .xls)');
    }
    if (expectedType === 'zip' && !fileName.endsWith('.zip')) {
      errors.push('Please upload a ZIP file (.zip)');
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  };

  // Check Google Apps Script connection
  const checkConnection = async () => {
    try {
      setConnectionStatus('checking');
      const response = await fetch(`${googleScriptUrl}?action=testConnection`);
      const data = await response.json();
      
      if (data.success) {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('error');
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      setConnectionStatus('error');
    }
  };

  // Handle user login
  const handleLogin = (user) => {
    setSelectedUser(user);
    setIsLoggedIn(true);
    setError('');
  };

  // Handle file upload
  const handleFileUpload = (fileType, file) => {
    if (file) {
      const validation = validateFile(
        file, 
        fileType === 'ims' ? 'zip' : 'excel'
      );
      
      if (validation.isValid) {
        setUploadedFiles(prev => ({
          ...prev,
          [fileType]: file
        }));
        setError('');
      } else {
        setError(`${fileType.toUpperCase()}: ${validation.errors.join(', ')}`);
      }
    }
  };

  // Handle reconciliation process
  const handleReconciliation = async () => {
    if (Object.keys(uploadedFiles).length === 0) {
      setError('Please upload at least one file before starting reconciliation.');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      // Step 1: Process files in browser
      console.log('🔄 Processing files...');
      const processedData = await processFiles(uploadedFiles, reconciliationType);
      
      if (!processedData.success) {
        // Don't proceed with reconciliation if file processing failed
        setReconciliationResults({
          success: false,
          error: processedData.error,
          processedData: processedData.data || { fileInfo: [] }
        });
        return;
      }

      console.log('✅ Files processed successfully');

      // Step 2: Send to Google Apps Script for reconciliation
      console.log('🔄 Performing reconciliation...');
      const reconciliationRequest = {
        reconciliationType,
        selectedUser,
        dateRange,
        processedData: processedData.data,
        filesProcessed: processedData.filesProcessed
      };

      const response = await fetch(`${googleScriptUrl}?action=performReconciliation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reconciliationRequest)
      });

      const results = await response.json();

      if (results.success) {
        // Include the processed data in results for file info display
        const enhancedResults = {
          ...results,
          processedData: processedData.data
        };
        setReconciliationResults(enhancedResults);
        console.log('✅ Reconciliation completed successfully');
      } else {
        throw new Error(results.error || 'Reconciliation failed');
      }

    } catch (error) {
      console.error('❌ Reconciliation failed:', error);
      setError(`Reconciliation failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Reset form
  const handleReset = () => {
    setUploadedFiles({});
    setReconciliationResults(null);
    setError('');
  };

  // Download results
  const downloadResults = () => {
    if (!reconciliationResults) return;

    const dataStr = JSON.stringify(reconciliationResults, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gst-reconciliation-${reconciliationType}-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Login Screen
  if (!isLoggedIn) {
    return (
      <>
        <style>{`
          /* GST Reconciliation Tool - Complete Styles */
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
              'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
              sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
          }

          .App {
            min-height: 100vh;
            color: #333;
          }

          /* ==================== LOGIN SCREEN ==================== */
          .login-container {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 2rem;
          }

          .login-card {
            background: white;
            border-radius: 16px;
            padding: 3rem;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            text-align: center;
            max-width: 500px;
            width: 100%;
            animation: slideUp 0.6s ease-out;
          }

          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(30px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .login-card h1 {
            color: #667eea;
            margin-bottom: 2rem;
            font-size: 2.5rem;
            font-weight: 700;
          }

          .connection-status {
            margin-bottom: 2rem;
          }

          .status-indicator {
            padding: 12px 24px;
            border-radius: 8px;
            font-weight: 600;
            margin-bottom: 1rem;
            transition: all 0.3s ease;
          }

          .status-indicator.checking {
            background-color: #fff3cd;
            color: #856404;
            border: 1px solid #ffeaa7;
          }

          .status-indicator.connected {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
          }

          .status-indicator.error {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
          }

          .retry-btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
          }

          .retry-btn:hover {
            background: #5a67d8;
            transform: translateY(-2px);
          }

          .user-selection h3 {
            margin-bottom: 1.5rem;
            color: #4a5568;
            font-size: 1.25rem;
          }

          .user-buttons {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 1rem;
          }

          .user-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 16px 24px;
            border-radius: 12px;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
          }

          .user-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
          }

          /* ==================== MAIN APP SCREEN ==================== */
          .app-header {
            background: white;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            padding: 1rem 2rem;
            position: sticky;
            top: 0;
            z-index: 100;
          }

          .header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
            max-width: 1400px;
            margin: 0 auto;
          }

          .header-content h1 {
            color: #667eea;
            font-size: 1.8rem;
            font-weight: 700;
          }

          .user-info {
            display: flex;
            align-items: center;
            gap: 1rem;
          }

          .user-info span {
            font-weight: 600;
            color: #4a5568;
            font-size: 1.1rem;
          }

          .logout-btn {
            background: #e53e3e;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
          }

          .logout-btn:hover {
            background: #c53030;
            transform: translateY(-2px);
          }

          .main-content {
            max-width: 1400px;
            margin: 0 auto;
            padding: 2rem;
          }

          /* ==================== SECTIONS ==================== */
          section {
            background: white;
            border-radius: 12px;
            padding: 2rem;
            margin-bottom: 2rem;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
            animation: fadeIn 0.6s ease-out;
          }

          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          section h2 {
            color: #2d3748;
            margin-bottom: 1.5rem;
            font-size: 1.5rem;
            font-weight: 700;
            border-bottom: 3px solid #667eea;
            padding-bottom: 0.5rem;
          }

          /* ==================== CONFIG SECTION ==================== */
          .config-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 2rem;
          }

          .config-item {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          }

          .config-item label {
            font-weight: 600;
            color: #4a5568;
            font-size: 1rem;
          }

          .config-item select,
          .config-item input {
            padding: 12px 16px;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            font-size: 1rem;
            transition: all 0.3s ease;
            background: white;
          }

          .config-item select:focus,
          .config-item input:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
          }

          /* ==================== UPLOAD SECTION ==================== */
          .upload-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 2rem;
          }

          .upload-item {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
          }

          .upload-item label {
            font-weight: 600;
            color: #4a5568;
            font-size: 1rem;
          }

          .upload-item input[type="file"] {
            padding: 12px 16px;
            border: 2px dashed #cbd5e0;
            border-radius: 8px;
            font-size: 0.95rem;
            transition: all 0.3s ease;
            background: #f7fafc;
            cursor: pointer;
          }

          .upload-item input[type="file"]:hover {
            border-color: #667eea;
            background: #edf2f7;
          }

          .file-info {
            background: #d4edda;
            color: #155724;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 0.9rem;
            font-weight: 500;
            border: 1px solid #c3e6cb;
          }

          .demo-note {
            margin-top: 1.5rem;
            padding: 1rem;
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 8px;
            color: #856404;
          }

          .processing-error {
            background: #f8d7da;
            color: #721c24;
            padding: 2rem;
            border-radius: 8px;
            border: 1px solid #f5c6cb;
            margin-bottom: 2rem;
          }

          .processing-error h3 {
            margin-bottom: 1rem;
            color: #721c24;
          }

          .processing-error code {
            background: #f1f3f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            color: #333;
          }

          /* ==================== ACTIONS SECTION ==================== */
          .action-buttons {
            display: flex;
            gap: 1rem;
            margin-bottom: 1rem;
            flex-wrap: wrap;
          }

          .primary-btn,
          .secondary-btn,
          .download-btn {
            padding: 14px 28px;
            border: none;
            border-radius: 8px;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }

          .primary-btn {
            background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
            color: white;
            box-shadow: 0 4px 15px rgba(72, 187, 120, 0.3);
          }

          .primary-btn:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(72, 187, 120, 0.4);
          }

          .primary-btn:disabled {
            background: #a0aec0;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
          }

          .secondary-btn {
            background: #edf2f7;
            color: #4a5568;
            border: 2px solid #e2e8f0;
          }

          .secondary-btn:hover:not(:disabled) {
            background: #e2e8f0;
            transform: translateY(-2px);
          }

          .download-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
          }

          .download-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
          }

          .error-message {
            background: #fed7d7;
            color: #9b2c2c;
            padding: 12px 16px;
            border-radius: 8px;
            border: 1px solid #feb2b2;
            font-weight: 500;
            margin-top: 1rem;
          }

          /* ==================== RESULTS SECTION ==================== */
          .summary-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 2rem;
            margin-bottom: 2rem;
          }

          .summary-card {
            background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%);
            border-radius: 12px;
            padding: 2rem;
            border: 1px solid #e2e8f0;
          }

          .summary-card h3 {
            color: #2d3748;
            margin-bottom: 1.5rem;
            font-size: 1.25rem;
            font-weight: 700;
          }

          .summary-stats {
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }

          .stat {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem;
            background: white;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
          }

          .stat-label {
            font-weight: 600;
            color: #4a5568;
          }

          .stat-value {
            font-weight: 700;
            font-size: 1.1rem;
            padding: 4px 12px;
            border-radius: 6px;
          }

          .stat-value.success {
            background: #c6f6d5;
            color: #22543d;
          }

          .stat-value.warning {
            background: #fefcbf;
            color: #744210;
          }

          .stat-value.error {
            background: #fed7d7;
            color: #742a2a;
          }

          .match-rate {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 120px;
          }

          .rate-circle {
            width: 100px;
            height: 100px;
            border-radius: 50%;
            background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: white;
            box-shadow: 0 4px 20px rgba(72, 187, 120, 0.3);
          }

          .rate-percentage {
            font-size: 1.5rem;
            font-weight: 700;
          }

          .rate-label {
            font-size: 0.8rem;
            font-weight: 500;
          }

          /* ==================== DETAILED RESULTS ==================== */
          .detailed-results {
            margin-top: 2rem;
          }

          .tab-content h3 {
            color: #2d3748;
            margin-bottom: 1.5rem;
            font-size: 1.25rem;
            font-weight: 700;
            padding: 1rem;
            background: #f7fafc;
            border-radius: 8px;
            border-left: 4px solid #667eea;
          }

          .matches-list,
          .mismatches-list {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            margin-bottom: 2rem;
          }

          .match-item,
          .mismatch-item {
            background: #f7fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 1.5rem;
            transition: all 0.3s ease;
          }

          .match-item:hover,
          .mismatch-item:hover {
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
            transform: translateY(-2px);
          }

          .match-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
          }

          .match-score {
            background: #667eea;
            color: white;
            padding: 4px 12px;
            border-radius: 6px;
            font-weight: 600;
            font-size: 0.9rem;
          }

          .match-status {
            padding: 4px 12px;
            border-radius: 6px;
            font-weight: 600;
            font-size: 0.9rem;
          }

          .match-status.matched {
            background: #c6f6d5;
            color: #22543d;
          }

          .match-status.partial {
            background: #fefcbf;
            color: #744210;
          }

          .match-status.unmatched {
            background: #fed7d7;
            color: #742a2a;
          }

          .match-details,
          .mismatch-details {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          }

          .record-info {
            font-size: 0.95rem;
            color: #4a5568;
          }

          .record-info strong {
            color: #2d3748;
            font-weight: 600;
          }

          .differences {
            margin-top: 0.75rem;
            padding: 0.75rem;
            background: #fff5f5;
            border-radius: 6px;
            border: 1px solid #fed7d7;
          }

          .difference {
            font-size: 0.9rem;
            color: #742a2a;
            margin-top: 0.25rem;
          }

          .show-more {
            text-align: center;
            padding: 1rem;
            color: #667eea;
            font-weight: 600;
            background: #edf2f7;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
          }

          .no-data {
            text-align: center;
            padding: 2rem;
            color: #a0aec0;
            font-style: italic;
            background: #f7fafc;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
          }

          /* ==================== RESPONSIVE DESIGN ==================== */
          @media (max-width: 768px) {
            .main-content {
              padding: 1rem;
            }
            
            .header-content {
              padding: 0 1rem;
              flex-direction: column;
              gap: 1rem;
            }
            
            .header-content h1 {
              font-size: 1.5rem;
            }
            
            .config-grid,
            .upload-grid {
              grid-template-columns: 1fr;
            }
            
            .action-buttons {
              flex-direction: column;
            }
            
            .summary-cards {
              grid-template-columns: 1fr;
            }
            
            .user-buttons {
              grid-template-columns: 1fr;
            }
            
            .login-card {
              padding: 2rem;
            }
            
            .login-card h1 {
              font-size: 2rem;
            }
          }

          @media (max-width: 480px) {
            .login-card {
              padding: 1.5rem;
              margin: 1rem;
            }
            
            section {
              padding: 1.5rem;
            }
            
            .match-header {
              flex-direction: column;
              gap: 0.5rem;
              align-items: stretch;
            }
          }
        `}</style>
        <div className="App">
        <div className="login-container">
          <div className="login-card">
            <h1>🧾 GST Reconciliation Tool</h1>
            
            <div className="connection-status">
              <div className={`status-indicator ${connectionStatus}`}>
                {connectionStatus === 'checking' && '🔄 Checking connection...'}
                {connectionStatus === 'connected' && '✅ Google Apps Script Connected'}
                {connectionStatus === 'error' && '❌ Connection Failed'}
              </div>
              {connectionStatus === 'error' && (
                <button onClick={checkConnection} className="retry-btn">
                  🔄 Retry Connection
                </button>
              )}
            </div>

            {connectionStatus === 'connected' && (
              <div className="user-selection">
                <h3>Select User:</h3>
                <div className="user-buttons">
                  {users.map(user => (
                    <button
                      key={user}
                      onClick={() => handleLogin(user)}
                      className="user-btn"
                    >
                      👤 {user}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Main App Screen
  return (
    <div className="App">
      <header className="app-header">
        <div className="header-content">
          <h1>🧾 GST Reconciliation Tool</h1>
          <div className="user-info">
            <span>👤 {selectedUser}</span>
            <button onClick={() => setIsLoggedIn(false)} className="logout-btn">
              🚪 Logout
            </button>
          </div>
        </div>
      </header>

      <main className="main-content">
        {/* Configuration Section */}
        <section className="config-section">
          <h2>📋 Reconciliation Configuration</h2>
          
          <div className="config-grid">
            <div className="config-item">
              <label>📅 Reconciliation Type:</label>
              <select 
                value={reconciliationType} 
                onChange={(e) => setReconciliationType(e.target.value)}
                disabled={isProcessing}
              >
                <option value="daily">Daily Reconciliation</option>
                <option value="weekly">Weekly Reconciliation</option>
                <option value="monthly">Monthly Reconciliation</option>
              </select>
            </div>

            <div className="config-item">
              <label>📅 Start Date:</label>
              <input 
                type="date" 
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                disabled={isProcessing}
              />
            </div>

            <div className="config-item">
              <label>📅 End Date:</label>
              <input 
                type="date" 
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                disabled={isProcessing}
              />
            </div>
          </div>
        </section>

        {/* File Upload Section */}
        <section className="upload-section">
          <h2>📁 File Upload</h2>
          
          <div className="upload-grid">
            {/* IMS Data */}
            <div className="upload-item">
              <label>📦 IMS Data (ZIP):</label>
              <input 
                type="file" 
                accept=".zip"
                onChange={(e) => handleFileUpload('ims', e.target.files[0])}
                disabled={isProcessing}
              />
              {uploadedFiles.ims && (
                <div className="file-info">✅ {uploadedFiles.ims.name}</div>
              )}
            </div>

            {/* GSTR-2A */}
            <div className="upload-item">
              <label>📊 GSTR-2A (Excel):</label>
              <input 
                type="file" 
                accept=".xlsx,.xls"
                onChange={(e) => handleFileUpload('gstr2a', e.target.files[0])}
                disabled={isProcessing}
              />
              {uploadedFiles.gstr2a && (
                <div className="file-info">✅ {uploadedFiles.gstr2a.name}</div>
              )}
            </div>

            {/* GSTR-2B */}
            <div className="upload-item">
              <label>📊 GSTR-2B (Excel):</label>
              <input 
                type="file" 
                accept=".xlsx,.xls"
                onChange={(e) => handleFileUpload('gstr2b', e.target.files[0])}
                disabled={isProcessing}
              />
              {uploadedFiles.gstr2b && (
                <div className="file-info">✅ {uploadedFiles.gstr2b.name}</div>
              )}
            </div>

            {/* Purchase Register */}
            <div className="upload-item">
              <label>📋 Purchase Register (Excel):</label>
              <input 
                type="file" 
                accept=".xlsx,.xls"
                onChange={(e) => handleFileUpload('purchaseRegister', e.target.files[0])}
                disabled={isProcessing}
              />
              {uploadedFiles.purchaseRegister && (
                <div className="file-info">✅ {uploadedFiles.purchaseRegister.name}</div>
              )}
            </div>

            {/* Logitax Purchase */}
            <div className="upload-item">
              <label>📈 Logitax Purchase (Excel):</label>
              <input 
                type="file" 
                accept=".xlsx,.xls"
                onChange={(e) => handleFileUpload('logitaxPurchase', e.target.files[0])}
                disabled={isProcessing}
              />
              {uploadedFiles.logitaxPurchase && (
                <div className="file-info">✅ {uploadedFiles.logitaxPurchase.name}</div>
              )}
            </div>
          </div>

          <div className="demo-note">
            <p><strong>⚠️ File Processing Requirements:</strong></p>
            <ul>
              <li>✅ <strong>File Upload:</strong> Reading actual file metadata (name, size, type)</li>
              <li>❌ <strong>Content Processing:</strong> Requires ExcelJS and JSZip libraries</li>
              <li>🔧 <strong>For Full Processing:</strong> Deploy to your local environment with proper dependencies</li>
              <li>🚫 <strong>No Sample Data:</strong> Will show processing errors without real libraries</li>
            </ul>
            {Object.keys(uploadedFiles).length > 0 && (
              <div style={{marginTop: '1rem'}}>
                <strong>Your Uploaded Files:</strong>
                {Object.entries(uploadedFiles).map(([type, file]) => (
                  <div key={type} style={{marginLeft: '1rem', marginTop: '0.5rem'}}>
                    📄 <strong>{type.toUpperCase()}:</strong> {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </div>
                ))}
                <div style={{marginTop: '0.5rem', fontSize: '0.9rem', color: '#856404'}}>
                  ⚠️ These files will be recognized but cannot be processed without ExcelJS/JSZip libraries.
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Actions Section */}
        <section className="actions-section">
          <div className="action-buttons">
            <button 
              onClick={handleReconciliation}
              disabled={isProcessing || Object.keys(uploadedFiles).length === 0}
              className="primary-btn"
            >
              {isProcessing ? '🔄 Processing...' : '🚀 Start Reconciliation'}
            </button>

            <button 
              onClick={handleReset}
              disabled={isProcessing}
              className="secondary-btn"
            >
              🔄 Reset
            </button>

            {reconciliationResults && (
              <button 
                onClick={downloadResults}
                className="download-btn"
              >
                💾 Download Results
              </button>
            )}
          </div>

          {error && (
            <div className="error-message">
              ❌ {error}
            </div>
          )}
        </section>

        {/* Results Section */}
        {reconciliationResults && (
          <section className="results-section">
            <h2>📊 Reconciliation Results</h2>
            
            {/* Show error state if no data was processed */}
            {!reconciliationResults.success && (
              <div className="processing-error" style={{
                background: '#f8d7da',
                color: '#721c24',
                padding: '2rem',
                borderRadius: '8px',
                border: '1px solid #f5c6cb',
                marginBottom: '2rem'
              }}>
                <h3>❌ File Processing Failed</h3>
                <p style={{marginTop: '1rem', lineHeight: '1.6'}}>
                  {reconciliationResults.error}
                </p>
                <div style={{marginTop: '1.5rem', padding: '1rem', background: '#fff3cd', color: '#856404', borderRadius: '6px'}}>
                  <strong>To fix this:</strong>
                  <ol style={{marginTop: '0.5rem', marginLeft: '1.5rem'}}>
                    <li>Copy this code to your local React project</li>
                    <li>Install dependencies: <code>npm install exceljs jszip</code></li>
                    <li>Create the fileProcessingService.js with ExcelJS implementation</li>
                    <li>Import and use the real file processing service</li>
                  </ol>
                </div>
              </div>
            )}
            
            {/* File Processing Info */}
            {reconciliationResults.processedData?.fileInfo && (
              <div className="file-processing-info" style={{marginBottom: '2rem'}}>
                <h3>📁 File Analysis</h3>
                <div className="processed-files-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem'}}>
                  {reconciliationResults.processedData.fileInfo.map((fileInfo, index) => (
                    <div key={index} className="processed-file-card" style={{
                      background: '#f8f9fa', 
                      padding: '1rem', 
                      borderRadius: '8px', 
                      border: '1px solid #e9ecef'
                    }}>
                      <div style={{fontWeight: 'bold', color: '#495057'}}>{fileInfo.type.toUpperCase()}</div>
                      <div style={{fontSize: '0.9rem', color: '#6c757d', marginTop: '0.5rem'}}>
                        📄 {fileInfo.name}<br/>
                        📏 {(fileInfo.size / 1024).toFixed(1)} KB<br/>
                        🕒 {fileInfo.lastModified}<br/>
                        <span style={{
                          color: fileInfo.status.includes('Error') ? '#dc3545' : '#fd7e14',
                          fontWeight: '500'
                        }}>
                          ⚠️ {fileInfo.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Only show summary if we have successful results */}
            {reconciliationResults.success && (
              <>
                <div className="summary-cards">
                  <div className="summary-card">
                    <h3>📈 Summary</h3>
                    <div className="summary-stats">
                      <div className="stat">
                        <span className="stat-label">Total IMS:</span>
                        <span className="stat-value">{reconciliationResults.summary?.totalIMS || 0}</span>
                      </div>
                      <div className="stat">
                        <span className="stat-label">Perfect Matches:</span>
                        <span className="stat-value success">{reconciliationResults.summary?.perfectMatches || 0}</span>
                      </div>
                      <div className="stat">
                        <span className="stat-label">Partial Matches:</span>
                        <span className="stat-value warning">{reconciliationResults.summary?.partialMatches || 0}</span>
                      </div>
                      <div className="stat">
                        <span className="stat-label">No Matches:</span>
                        <span className="stat-value error">{reconciliationResults.summary?.noMatches || 0}</span>
                      </div>
                    </div>
                  </div>

                  <div className="summary-card">
                    <h3>🎯 Match Rate</h3>
                    <div className="match-rate">
                      {reconciliationResults.summary?.totalIMS > 0 ? (
                        <div className="rate-circle">
                          <span className="rate-percentage">
                            {Math.round(((reconciliationResults.summary.perfectMatches + reconciliationResults.summary.partialMatches) / reconciliationResults.summary.totalIMS) * 100)}%
                          </span>
                          <span className="rate-label">Match Rate</span>
                        </div>
                      ) : (
                        <div style={{textAlign: 'center', color: '#6c757d'}}>
                          <div style={{fontSize: '2rem', marginBottom: '0.5rem'}}>❌</div>
                          <div>No data to analyze</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Detailed Results */}
                <div className="detailed-results">
                  <div className="result-tabs">
                    <div className="tab-content">
                      <h3>✅ Matched Records ({reconciliationResults.matches?.length || 0})</h3>
                      {reconciliationResults.matches && reconciliationResults.matches.length > 0 ? (
                        <div className="matches-list">
                          {reconciliationResults.matches.slice(0, 10).map((match, index) => (
                            <div key={index} className="match-item">
                              <div className="match-header">
                                <span className="match-score">{match.matchScore || 100}% Match</span>
                                <span className={`match-status ${match.status?.toLowerCase() || 'matched'}`}>
                                  {match.matchType || 'Perfect Match'}
                                </span>
                              </div>
                              <div className="match-details">
                                <div className="record-info">
                                  <strong>IMS:</strong> {match.imsRecord?.documentNumber} - ₹{match.imsRecord?.totalValue}
                                  {match.imsRecord?.fileName && (
                                    <span style={{fontSize: '0.8rem', color: '#6c757d', marginLeft: '0.5rem'}}>
                                      (from {match.imsRecord.fileName})
                                    </span>
                                  )}
                                </div>
                                <div className="record-info">
                                  <strong>Matched:</strong> {match.matchedRecord?.documentNumber} - ₹{match.matchedRecord?.totalValue}
                                  {match.matchedRecord?.fileName && (
                                    <span style={{fontSize: '0.8rem', color: '#6c757d', marginLeft: '0.5rem'}}>
                                      (from {match.matchedRecord.fileName})
                                    </span>
                                  )}
                                </div>
                                {match.differences && match.differences.length > 0 && (
                                  <div className="differences">
                                    <strong>Differences:</strong>
                                    {match.differences.map((diff, diffIndex) => (
                                      <div key={diffIndex} className="difference">
                                        {diff.field}: IMS ₹{diff.ims} vs Matched ₹{diff.matched}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          {reconciliationResults.matches.length > 10 && (
                            <div className="show-more">
                              ... and {reconciliationResults.matches.length - 10} more matches
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="no-data">No matched records found - requires actual file processing</div>
                      )}

                      <h3 style={{marginTop: '2rem'}}>❌ Unmatched Records ({reconciliationResults.mismatches?.length || 0})</h3>
                      {reconciliationResults.mismatches && reconciliationResults.mismatches.length > 0 ? (
                        <div className="mismatches-list">
                          {reconciliationResults.mismatches.slice(0, 10).map((mismatch, index) => (
                            <div key={index} className="mismatch-item">
                              <div className="mismatch-details">
                                <div className="record-info">
                                  <strong>IMS:</strong> {mismatch.imsRecord?.documentNumber} - ₹{mismatch.imsRecord?.totalValue}
                                  {mismatch.imsRecord?.fileName && (
                                    <span style={{fontSize: '0.8rem', color: '#6c757d', marginLeft: '0.5rem'}}>
                                      (from {mismatch.imsRecord.fileName})
                                    </span>
                                  )}
                                </div>
                                <div className="record-info">
                                  <strong>GSTIN:</strong> {mismatch.imsRecord?.gstin}
                                </div>
                                <div className="record-info">
                                  <strong>Date:</strong> {mismatch.imsRecord?.documentDate}
                                </div>
                              </div>
                            </div>
                          ))}
                          {reconciliationResults.mismatches.length > 10 && (
                            <div className="show-more">
                              ... and {reconciliationResults.mismatches.length - 10} more unmatched records
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="no-data">No unmatched records found - requires actual file processing</div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </div> {/* closes <div className="App"> */}
  );
}

export default App;
