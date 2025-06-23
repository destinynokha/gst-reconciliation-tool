import React, { useState, useEffect } from 'react';
import ExcelJS from 'exceljs';

function App() {
  // State variables
  const [uploadedFiles, setUploadedFiles] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [reconciliationResults, setReconciliationResults] = useState(null);
  const [error, setError] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const [reconciliationType, setReconciliationType] = useState('monthly');
  const [selectedUser, setSelectedUser] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // Check connection on component mount
  useEffect(() => {
    checkConnection();
  }, []);

  // Check system connection
  const checkConnection = () => {
    try {
      setConnectionStatus('connected');
      console.log('✅ System ready for file processing');
    } catch (error) {
      setConnectionStatus('error');
      console.error('❌ Connection check failed:', error);
    }
  };

  // Handle reconciliation process with user validation
  const handleReconciliation = async () => {
    // Validate user selection
    if (!selectedUser) {
      setError('Please select a user before starting reconciliation.');
      return;
    }

    if (Object.keys(uploadedFiles).length === 0) {
      setError('Please upload at least one file before starting reconciliation.');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      console.log(`🔄 Starting ${reconciliationType} reconciliation for user: ${selectedUser}`);
      
      // Step 1: Process files in browser
      console.log('🔄 Processing files...');
      const processedData = await processFiles(uploadedFiles, reconciliationType);
      
      if (!processedData.success) {
        // Show processing results even if no data was extracted
        setReconciliationResults({
          success: false,
          error: processedData.error,
          processedData: processedData.data || { fileInfo: [] },
          requiresLibraries: processedData.requiresLibraries
        });
        return;
      }

      console.log('✅ Files processed successfully');

      // Step 2: Perform reconciliation locally
      console.log('🔄 Performing reconciliation analysis...');
      
      const reconciliationResults = performLocalReconciliation(processedData.data, {
        reconciliationType,
        selectedUser,
        dateRange,
        filesProcessed: processedData.filesProcessed,
        totalRecords: processedData.totalRecords
      });

      // Include the processed data in results for display
      const enhancedResults = {
        ...reconciliationResults,
        processedData: processedData.data,
        userInfo: {
          selectedUser,
          reconciliationType,
          processedAt: new Date().toISOString()
        }
      };
      
      setReconciliationResults(enhancedResults);
      console.log('✅ Reconciliation completed successfully');

    } catch (error) {
      console.error('❌ Reconciliation failed:', error);
      setError(`Reconciliation failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Perform reconciliation locally without external service
  const performLocalReconciliation = (processedData, config) => {
    try {
      console.log('🔍 Analyzing processed data for reconciliation...');

      const reconciliationReport = {
        summary: {
          totalRecords: 0,
          matchedRecords: 0,
          unmatchedRecords: 0,
          duplicateRecords: 0,
          taxDiscrepancies: 0
        },
        matches: [],
        discrepancies: [],
        duplicates: [],
        analysis: {}
      };

      // Combine all data for analysis
      const allRecords = [];
      Object.entries(processedData).forEach(([source, records]) => {
        if (source !== 'fileInfo' && Array.isArray(records)) {
          records.forEach(record => {
            allRecords.push({
              ...record,
              source: source,
              recordId: `${source}_${allRecords.length}`
            });
          });
        }
      });

      reconciliationReport.summary.totalRecords = allRecords.length;

      // Perform basic reconciliation analysis
      if (allRecords.length > 0) {
        // Group by potential matching fields (GSTIN, Invoice Number, etc.)
        const recordGroups = {};
        
        allRecords.forEach(record => {
          const keys = Object.keys(record);
          let matchingKey = null;
          
          // Look for common GST fields
          const gstinField = keys.find(k => k.toLowerCase().includes('gstin') || k.toLowerCase().includes('gst'));
          const invoiceField = keys.find(k => k.toLowerCase().includes('invoice') || k.toLowerCase().includes('inv'));
          const amountField = keys.find(k => k.toLowerCase().includes('amount') || k.toLowerCase().includes('value'));
          
          if (gstinField && record[gstinField]) {
            matchingKey = record[gstinField];
          } else if (invoiceField && record[invoiceField]) {
            matchingKey = record[invoiceField];
          } else if (amountField && record[amountField]) {
            matchingKey = record[amountField];
          }
          
          if (matchingKey) {
            if (!recordGroups[matchingKey]) {
              recordGroups[matchingKey] = [];
            }
            recordGroups[matchingKey].push(record);
          }
        });

        // Analyze groups for matches and discrepancies
        Object.entries(recordGroups).forEach(([key, records]) => {
          if (records.length > 1) {
            // Potential matches found
            reconciliationReport.summary.matchedRecords += records.length;
            reconciliationReport.matches.push({
              matchingKey: key,
              records: records,
              sources: [...new Set(records.map(r => r.source))]
            });
            
            // Check for duplicates (same source)
            const sourceGroups = {};
            records.forEach(record => {
              if (!sourceGroups[record.source]) {
                sourceGroups[record.source] = [];
              }
              sourceGroups[record.source].push(record);
            });
            
            Object.entries(sourceGroups).forEach(([source, sourceRecords]) => {
              if (sourceRecords.length > 1) {
                reconciliationReport.summary.duplicateRecords += sourceRecords.length;
                reconciliationReport.duplicates.push({
                  source: source,
                  matchingKey: key,
                  records: sourceRecords
                });
              }
            });
          } else {
            // Unmatched record
            reconciliationReport.summary.unmatchedRecords += 1;
          }
        });

        // Create analysis summary
        reconciliationReport.analysis = {
          dataQuality: {
            completeness: ((allRecords.length - reconciliationReport.summary.unmatchedRecords) / allRecords.length * 100).toFixed(1),
            duplicateRate: (reconciliationReport.summary.duplicateRecords / allRecords.length * 100).toFixed(1)
          },
          reconciliationRate: (reconciliationReport.summary.matchedRecords / allRecords.length * 100).toFixed(1),
          recommendations: generateRecommendations(reconciliationReport)
        };
      }

      return {
        success: true,
        reconciliationReport: reconciliationReport,
        processedAt: new Date().toISOString(),
        config: config
      };

    } catch (error) {
      console.error('❌ Local reconciliation failed:', error);
      return {
        success: false,
        error: `Reconciliation analysis failed: ${error.message}`
      };
    }
  };

  // Generate recommendations based on reconciliation results
  const generateRecommendations = (report) => {
    const recommendations = [];
    
    if (report.summary.duplicateRecords > 0) {
      recommendations.push(`Found ${report.summary.duplicateRecords} duplicate records - consider data deduplication`);
    }
    
    if (report.summary.unmatchedRecords > report.summary.matchedRecords) {
      recommendations.push('High number of unmatched records - review data formats and matching criteria');
    }
    
    if (report.matches.length > 0) {
      recommendations.push(`Successfully matched ${report.matches.length} record groups across different sources`);
    }
    
    return recommendations;
  };

  // Process Excel files using ExcelJS
  const processExcelFile = async (file, fileType) => {
    try {
      console.log(`📊 Processing Excel file for ${fileType}...`);
      
      // Read the file as array buffer
      const arrayBuffer = await readFileAsArrayBuffer(file);
      
      // Create a new workbook and load the buffer
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      
      // Get the first worksheet
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error('Excel file contains no worksheets');
      }
      
      const data = [];
      let headers = [];
      
      // Process rows
      worksheet.eachRow((row, rowNumber) => {
        const rowValues = [];
        
        // Get all cell values in the row
        row.eachCell((cell, colNumber) => {
          let value = cell.value;
          
          // Handle different cell types
          if (value && typeof value === 'object') {
            if (value.result !== undefined) {
              // Formula cell
              value = value.result;
            } else if (value.text !== undefined) {
              // Rich text cell
              value = value.text;
            }
          }
          
          rowValues[colNumber - 1] = value || '';
        });
        
        if (rowNumber === 1) {
          // First row is headers
          headers = rowValues.map(h => String(h).trim()).filter(h => h.length > 0);
        } else {
          // Data rows
          if (rowValues.some(val => val !== '')) { // Skip empty rows
            const rowObj = {};
            headers.forEach((header, index) => {
              const value = rowValues[index] || '';
              const trimmedValue = String(value).trim();
              rowObj[header] = isNumericString(trimmedValue) ? parseFloat(trimmedValue) : trimmedValue;
            });
            data.push(rowObj);
          }
        }
      });
      
      console.log(`✅ Successfully extracted ${data.length} records from Excel file`);
      
      return {
        data: data,
        error: null
      };
      
    } catch (error) {
      console.error(`❌ Excel processing error:`, error);
      return {
        data: [],
        error: error.message
      };
    }
  };

  // Process CSV files using built-in JavaScript (robust CSV parser)
  const processCsvFile = async (file, fileType) => {
    try {
      console.log(`📄 Processing CSV file for ${fileType}...`);
      
      const text = await readFileAsText(file);
      
      if (!text || text.trim().length === 0) {
        throw new Error('CSV file is empty');
      }

      // Parse CSV with robust handling of quotes and delimiters
      const data = parseCSV(text);
      
      if (data.length === 0) {
        throw new Error('CSV file contains no valid data rows');
      }

      console.log(`✅ Successfully extracted ${data.length} records from CSV file`);

      return {
        data: data,
        error: null
      };
      
    } catch (error) {
      console.error(`❌ CSV processing error:`, error);
      return {
        data: [],
        error: error.message
      };
    }
  };

  // Robust CSV parser that handles quotes, commas, and line breaks
  const parseCSV = (text) => {
    const lines = [];
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;

    // First, split into logical rows (handling quoted fields with line breaks)
    while (i < text.length) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator
        currentRow.push(currentField.trim());
        currentField = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        // Row separator
        if (currentField || currentRow.length > 0) {
          currentRow.push(currentField.trim());
          if (currentRow.some(field => field.length > 0)) {
            lines.push([...currentRow]);
          }
          currentRow = [];
          currentField = '';
        }
        // Skip \r\n sequence
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
      } else {
        currentField += char;
      }
      i++;
    }

    // Add final row if exists
    if (currentField || currentRow.length > 0) {
      currentRow.push(currentField.trim());
      if (currentRow.some(field => field.length > 0)) {
        lines.push(currentRow);
      }
    }

    if (lines.length < 2) {
      throw new Error('CSV file must contain at least a header row and one data row');
    }

    // Convert to objects using first row as headers
    const headers = lines[0].map(header => String(header).trim());
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i];
      if (values.some(val => val.length > 0)) { // Skip empty rows
        const rowObj = {};
        headers.forEach((header, index) => {
          const value = values[index] || '';
          // Convert numeric strings to numbers where appropriate
          const trimmedValue = String(value).trim();
          rowObj[header] = isNumericString(trimmedValue) ? parseFloat(trimmedValue) : trimmedValue;
        });
        rows.push(rowObj);
      }
    }

    return rows;
  };

  // Helper function to detect numeric strings
  const isNumericString = (str) => {
    if (!str || str.length === 0) return false;
    // Allow numbers with decimals, commas, and negative signs
    const cleanStr = str.replace(/,/g, '');
    return !isNaN(cleanStr) && !isNaN(parseFloat(cleanStr)) && isFinite(cleanStr);
  };

  // Read file as array buffer
  const readFileAsArrayBuffer = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  };

  // Read file as text
  const readFileAsText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  // Demo data for testing the processing functionality
  const generateDemoData = (fileType) => {
    console.log(`🎯 Generating demo data for ${fileType}...`);
    
    const baseDemo = [
      {
        'Invoice Number': 'INV-2024-001',
        'Date': '2024-01-15',
        'GSTIN': '27AABCU9603R1ZX',
        'Amount': 25000,
        'CGST': 2250,
        'SGST': 2250,
        'IGST': 0,
        'Total Tax': 4500
      },
      {
        'Invoice Number': 'INV-2024-002', 
        'Date': '2024-01-16',
        'GSTIN': '27AABCU9603R1ZY',
        'Amount': 18000,
        'CGST': 1620,
        'SGST': 1620,
        'IGST': 0,
        'Total Tax': 3240
      },
      {
        'Invoice Number': 'INV-2024-003',
        'Date': '2024-01-17', 
        'GSTIN': '27AABCU9603R1ZZ',
        'Amount': 32000,
        'CGST': 0,
        'SGST': 0,
        'IGST': 5760,
        'Total Tax': 5760
      }
    ];

    // Customize based on file type
    return baseDemo.map(item => ({
      ...item,
      'Source': fileType.toUpperCase(),
      'Processed At': new Date().toISOString()
    }));
  };

  // Handle demo data generation
  const handleDemoData = () => {
    const demoResults = {
      ims: generateDemoData('ims'),
      gstr2a: generateDemoData('gstr2a'), 
      gstr2b: generateDemoData('gstr2b'),
      purchaseRegister: generateDemoData('purchaseRegister'),
      logitaxPurchase: generateDemoData('logitaxPurchase'),
      fileInfo: [
        {
          type: 'demo',
          name: 'Demo Data Generated',
          size: 0,
          lastModified: new Date().toLocaleString(),
          mimeType: 'application/demo',
          recordsExtracted: 15,
          status: 'Demo data generated successfully'
        }
      ]
    };

    setReconciliationResults({
      success: true,
      processedData: demoResults,
      totalRecords: 15,
      processedAt: new Date().toISOString(),
      isDemoData: true
    });

    console.log('✅ Demo data generated successfully');
  };

  // Process all uploaded files
  const processFiles = async (files, reconciliationType) => {
    const processedData = { fileInfo: [] };
    let totalRecords = 0;
    let filesProcessed = 0;
    let hasProcessedData = false;
    let requiresLibraries = false;

    for (const [fileType, file] of Object.entries(files)) {
      if (!file) continue;

      console.log(`📁 Processing ${fileType}: ${file.name}`);
      
      let result = { data: [], error: null };
      let status = 'Processing...';

      try {
        // Determine file type and process accordingly
        const fileName = file.name.toLowerCase();
        
        if (fileName.endsWith('.csv')) {
          result = await processCsvFile(file, fileType);
        } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
          result = await processExcelFile(file, fileType);
        } else {
          result = { 
            data: [], 
            error: `Unsupported file type. Please use .csv, .xlsx, or .xls files.` 
          };
        }

        const extractedData = result.data || [];
        const errorDetails = result.error;

        // Only add to processed data if we actually extracted something
        if (extractedData && extractedData.length > 0) {
          processedData[fileType] = extractedData;
          hasProcessedData = true;
          status = `Successfully extracted ${extractedData.length} records`;
        } else if (errorDetails && errorDetails.includes('convert')) {
          // Special handling for Excel files that need conversion
          status = `Excel file detected - please save as CSV format for data extraction`;
        } else {
          status = errorDetails || 'No data extracted';
        }

        totalRecords += extractedData.length;
        filesProcessed++;

      } catch (error) {
        console.error(`❌ Error processing ${fileType}:`, error);
        status = `Error: ${error.message}`;
      }

      // Add file info
      processedData.fileInfo.push({
        type: fileType,
        name: file.name,
        size: file.size,
        lastModified: new Date(file.lastModified).toLocaleString(),
        mimeType: file.type,
        recordsExtracted: result.data ? result.data.length : 0,
        status: status
      });
    }

    if (!hasProcessedData) {
      const hasFiles = Object.keys(files).length > 0;
      const needsLibraries = requiresLibraries;
      
      let errorMessage = 'No data could be extracted from uploaded files.';
      
      if (needsLibraries) {
        errorMessage += ' Please check that your files are in the correct format (Excel or CSV).';
      } else if (hasFiles) {
        errorMessage += ' Please check that your files contain valid data and are in the correct format.';
      } else {
        errorMessage = 'No files were uploaded for processing.';
      }

      return {
        success: false,
        error: errorMessage,
        data: processedData,
        requiresLibraries: needsLibraries
      };
    }

    return {
      success: true,
      data: processedData,
      totalRecords: totalRecords,
      filesProcessed: filesProcessed
    };
  };

  // Validate uploaded file
  const validateFile = (file, expectedType) => {
    const errors = [];

    // Check file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      errors.push('File size exceeds 50MB limit');
    }

    // Check file type - accept Excel and CSV only
    const fileName = file.name.toLowerCase();
    const supportedExtensions = ['.csv', '.xlsx', '.xls'];
    const isSupported = supportedExtensions.some(ext => fileName.endsWith(ext));
    
    if (!isSupported) {
      errors.push('Please upload Excel (.xlsx, .xls) or CSV (.csv) files only');
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  };

  // Handle file upload
  const handleFileUpload = (fileType, file) => {
    if (!file) return;

    setError('');

    // Validate file - now accepts all supported file types
    const validation = validateFile(file, 'all');
    if (!validation.isValid) {
      setError(validation.errors.join('. '));
      return;
    }

    console.log(`📁 File uploaded for ${fileType}:`, file.name);
    setUploadedFiles(prev => ({
      ...prev,
      [fileType]: file
    }));
  };

  // Handle reset
  const handleReset = () => {
    setUploadedFiles({});
    setReconciliationResults(null);
    setError('');
    setIsProcessing(false);
    console.log('🔄 Application reset');
  };

  // Download results as JSON
  const downloadResults = () => {
    if (!reconciliationResults) return;

    const dataStr = JSON.stringify(reconciliationResults, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gst_reconciliation_results_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '2rem',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      minHeight: '100vh'
    }}>
      <style>
        {`
          * {
            box-sizing: border-box;
          }
          
          .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.15);
            padding: 3rem;
            margin: 2rem 0;
          }
          
          .header {
            text-align: center;
            margin-bottom: 3rem;
          }
          
          .title {
            font-size: 2.5rem;
            font-weight: 700;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 1rem;
          }
          
          .subtitle {
            font-size: 1.2rem;
            color: #6b7280;
            margin-bottom: 1rem;
          }
          
          .status-indicator {
            display: inline-flex;
            align-items: center;
            padding: 0.5rem 1rem;
            border-radius: 25px;
            font-size: 0.9rem;
            font-weight: 500;
          }
          
          .status-connected {
            background: #d1fae5;
            color: #065f46;
          }
          
          .status-error {
            background: #fee2e2;
            color: #991b1b;
          }
          
          .status-checking {
            background: #dbeafe;
            color: #1d4ed8;
          }
          
          .upload-section {
            margin-bottom: 3rem;
          }
          
          .user-section {
            margin-bottom: 3rem;
            background: #f8fafc;
            padding: 2rem;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
          }
          
          .section-title {
            font-size: 1.5rem;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 1.5rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }
          
          .upload-grid {
            display: grid;
            gap: 1.5rem;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          }
          
          .upload-item {
            background: #f9fafb;
            border: 2px dashed #d1d5db;
            border-radius: 12px;
            padding: 1.5rem;
            transition: all 0.3s ease;
          }
          
          .upload-item:hover {
            border-color: #6366f1;
            background: #f0f9ff;
          }
          
          .upload-item label {
            display: block;
            font-weight: 500;
            color: #374151;
            margin-bottom: 0.75rem;
          }
          
          .upload-item input[type="file"] {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            background: white;
            font-size: 0.9rem;
          }
          
          .file-info {
            margin-top: 0.75rem;
            padding: 0.5rem;
            background: #dcfce7;
            color: #166534;
            border-radius: 6px;
            font-size: 0.9rem;
          }
          
          .actions-section {
            margin-bottom: 3rem;
          }
          
          .action-buttons {
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
            justify-content: center;
            margin-bottom: 1rem;
          }
          
          .primary-btn, .secondary-btn, .download-btn {
            padding: 0.875rem 2rem;
            border: none;
            border-radius: 10px;
            font-weight: 600;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }
          
          .primary-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
          }
          
          .primary-btn:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.6);
          }
          
          .primary-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
          }
          
          .secondary-btn {
            background: #f3f4f6;
            color: #374151;
            border: 1px solid #d1d5db;
          }
          
          .secondary-btn:hover:not(:disabled) {
            background: #e5e7eb;
            transform: translateY(-1px);
          }
          
          .download-btn {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
          }
          
          .download-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(16, 185, 129, 0.6);
          }
          
          .error-message {
            background: #fee2e2;
            color: #991b1b;
            padding: 1rem;
            border-radius: 8px;
            border: 1px solid #fecaca;
            margin-top: 1rem;
          }
          
          .library-info {
            background: #f0f9ff;
            border: 1px solid #0ea5e9;
            border-radius: 12px;
            padding: 1.5rem;
            margin-bottom: 2rem;
          }
          
          .library-info h4 {
            margin: 0 0 1rem 0;
            color: #0c4a6e;
          }
          
          .library-info p {
            margin: 0.5rem 0;
            color: #075985;
          }
          
          .library-info code {
            background: #e0f2fe;
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
            font-size: 0.9rem;
          }
          
          .results-section {
            margin-top: 3rem;
          }
          
          .reconciliation-summary {
            border-radius: 12px;
            margin-bottom: 2rem;
          }
          
          .reconciliation-summary h3 {
            margin: 0 0 1rem 0;
            font-size: 1.5rem;
          }
          
          .reconciliation-summary p {
            margin: 0.5rem 0;
          }
          
          .data-preview {
            margin-bottom: 2rem;
          }
          
          .data-preview h3 {
            color: #1f2937;
            margin-bottom: 1rem;
          }
          
          @media (max-width: 768px) {
            .container {
              padding: 1.5rem;
              margin: 1rem;
            }
            
            .title {
              font-size: 2rem;
            }
            
            .upload-grid {
              grid-template-columns: 1fr;
            }
            
            .action-buttons {
              flex-direction: column;
              align-items: center;
            }
            
            .primary-btn, .secondary-btn, .download-btn {
              width: 100%;
              max-width: 300px;
            }
          }
        `}
      </style>

      <div className="container">
        {/* Header */}
        <header className="header">
          <h1 className="title">GST Reconciliation Tool</h1>
          <p className="subtitle">Reconcile GSTR-2A, GSTR-2B, Purchase Register, and IMS data</p>
          <div className={`status-indicator status-${connectionStatus}`}>
            {connectionStatus === 'connected' && '✅ System Ready'}
            {connectionStatus === 'checking' && '🔄 Checking System...'}
            {connectionStatus === 'error' && '❌ Connection Error'}
          </div>
        </header>

        {/* User Login Section */}
        <section className="user-section">
          <h2 className="section-title">👤 User Information</h2>
          <div style={{display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))'}}>
            <div>
              <label style={{display: 'block', marginBottom: '0.5rem', fontWeight: '500'}}>Select User:</label>
              <select 
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
              >
                <option value="">Choose a user...</option>
                <option value="admin">Admin User</option>
                <option value="accountant">Accountant</option>
                <option value="manager">Manager</option>
                <option value="auditor">Auditor</option>
              </select>
            </div>
            <div>
              <label style={{display: 'block', marginBottom: '0.5rem', fontWeight: '500'}}>Reconciliation Period:</label>
              <select 
                value={reconciliationType}
                onChange={(e) => setReconciliationType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
              >
                <option value="monthly">Monthly Reconciliation</option>
                <option value="quarterly">Quarterly Reconciliation</option>
                <option value="annual">Annual Reconciliation</option>
                <option value="custom">Custom Period</option>
              </select>
            </div>
          </div>
        </section>

        {/* File Processing Information */}
        <div className="library-info">
          <h4>📄 File Processing:</h4>
          <p>• <strong>✅ CSV files (.csv)</strong> → Immediate processing</p>
          <p>• <strong>✅ Excel files (.xlsx/.xls)</strong> → Full support</p>
          <p>• <strong>🎯 Demo Data</strong> → Test reconciliation without uploading files</p>
          <p>• <strong>📊 Results</strong> → View reconciliation analysis directly on this page</p>
        </div>

        {/* Upload Section */}
        <section className="upload-section">
          <h2 className="section-title">📁 Upload Files</h2>
          <div className="upload-grid">
            {/* IMS Upload */}
            <div className="upload-item">
              <label>🏢 IMS Data (Excel/CSV):</label>
              <input 
                type="file" 
                accept=".csv,.xlsx,.xls"
                onChange={(e) => handleFileUpload('ims', e.target.files[0])}
                disabled={isProcessing}
              />
              {uploadedFiles.ims && (
                <div className="file-info">✅ {uploadedFiles.ims.name}</div>
              )}
            </div>

            {/* GSTR-2A */}
            <div className="upload-item">
              <label>📊 GSTR-2A (Excel/CSV):</label>
              <input 
                type="file" 
                accept=".csv,.xlsx,.xls"
                onChange={(e) => handleFileUpload('gstr2a', e.target.files[0])}
                disabled={isProcessing}
              />
              {uploadedFiles.gstr2a && (
                <div className="file-info">✅ {uploadedFiles.gstr2a.name}</div>
              )}
            </div>

            {/* GSTR-2B */}
            <div className="upload-item">
              <label>📊 GSTR-2B (Excel/CSV):</label>
              <input 
                type="file" 
                accept=".csv,.xlsx,.xls"
                onChange={(e) => handleFileUpload('gstr2b', e.target.files[0])}
                disabled={isProcessing}
              />
              {uploadedFiles.gstr2b && (
                <div className="file-info">✅ {uploadedFiles.gstr2b.name}</div>
              )}
            </div>

            {/* Purchase Register */}
            <div className="upload-item">
              <label>📋 Purchase Register (Excel/CSV):</label>
              <input 
                type="file" 
                accept=".csv,.xlsx,.xls"
                onChange={(e) => handleFileUpload('purchaseRegister', e.target.files[0])}
                disabled={isProcessing}
              />
              {uploadedFiles.purchaseRegister && (
                <div className="file-info">✅ {uploadedFiles.purchaseRegister.name}</div>
              )}
            </div>

            {/* Logitax Purchase */}
            <div className="upload-item">
              <label>📈 Logitax Purchase (Excel/CSV):</label>
              <input 
                type="file" 
                accept=".csv,.xlsx,.xls"
                onChange={(e) => handleFileUpload('logitaxPurchase', e.target.files[0])}
                disabled={isProcessing}
              />
              {uploadedFiles.logitaxPurchase && (
                <div className="file-info">✅ {uploadedFiles.logitaxPurchase.name}</div>
              )}
            </div>
          </div>
        </section>

        {/* Actions Section */}
        <section className="actions-section">
          <div className="action-buttons">
            <button 
              onClick={handleReconciliation}
              disabled={isProcessing || Object.keys(uploadedFiles).length === 0 || !selectedUser}
              className="primary-btn"
            >
              {isProcessing ? '🔄 Processing...' : '🚀 Start Reconciliation'}
            </button>

            <button 
              onClick={handleDemoData}
              disabled={isProcessing}
              className="secondary-btn"
              style={{
                background: 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)',
                color: 'white',
                border: 'none'
              }}
            >
              🎯 Try Demo Data
            </button>

            <button 
              onClick={handleReset}
              disabled={isProcessing}
              className="secondary-btn"
            >
              🔄 Reset
            </button>
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
            <h2 className="section-title">📊 Results</h2>
            
            {/* Show error state */}
            {!reconciliationResults.success && (
              <div style={{
                background: '#fee2e2',
                color: '#991b1b',
                padding: '2rem',
                borderRadius: '8px',
                border: '1px solid #fecaca'
              }}>
                <h3>❌ File Processing Issue</h3>
                <p>{reconciliationResults.error}</p>
                {reconciliationResults.requiresLibraries && (
                  <div style={{marginTop: '1rem', padding: '1rem', background: '#e3f2fd', borderRadius: '6px'}}>
                    <strong>File Format Issue:</strong> Please ensure your files are in Excel (.xlsx, .xls) or CSV (.csv) format.
                  </div>
                )}
              </div>
            )}

            {/* Show successful reconciliation results */}
            {reconciliationResults.success && (
              <div className="reconciliation-summary" style={{
                background: reconciliationResults.isDemoData ? '#e3f2fd' : '#d4edda',
                color: reconciliationResults.isDemoData ? '#1565c0' : '#155724',
                padding: '2rem',
                borderRadius: '8px',
                border: `1px solid ${reconciliationResults.isDemoData ? '#90caf9' : '#c3e6cb'}`,
                marginBottom: '2rem'
              }}>
                <h3>{reconciliationResults.isDemoData ? '🎯 Demo Reconciliation Complete' : '✅ Reconciliation Completed Successfully'}</h3>
                {reconciliationResults.userInfo && (
                  <div style={{marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.5)', borderRadius: '6px'}}>
                    <p><strong>User:</strong> {reconciliationResults.userInfo.selectedUser}</p>
                    <p><strong>Period:</strong> {reconciliationResults.userInfo.reconciliationType}</p>
                    <p><strong>Processed At:</strong> {new Date(reconciliationResults.userInfo.processedAt).toLocaleString()}</p>
                  </div>
                )}
                <p style={{marginTop: '1rem'}}>
                  <strong>Total records processed:</strong> {reconciliationResults.totalRecords || 'N/A'}
                </p>
                {reconciliationResults.isDemoData && (
                  <p style={{marginTop: '1rem', fontStyle: 'italic'}}>
                    This is demo data showing how reconciliation works. Upload your real files to process actual GST data!
                  </p>
                )}
              </div>
            )}

            {/* Show processed data preview */}
            {reconciliationResults?.processedData && (
              <div className="data-preview" style={{marginBottom: '2rem'}}>
                <h3>📊 Processed Data Preview</h3>
                {Object.entries(reconciliationResults.processedData).map(([dataType, data]) => {
                  if (dataType === 'fileInfo' || !Array.isArray(data) || data.length === 0) return null;
                  
                  return (
                    <div key={dataType} style={{
                      marginBottom: '1.5rem',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        background: '#f7fafc',
                        padding: '1rem',
                        borderBottom: '1px solid #e2e8f0',
                        fontWeight: 'bold',
                        color: '#2d3748'
                      }}>
                        {dataType.toUpperCase()} - {data.length} records
                      </div>
                      <div style={{
                        maxHeight: '300px',
                        overflow: 'auto',
                        background: 'white'
                      }}>
                        <table style={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          fontSize: '0.9rem'
                        }}>
                          <thead>
                            <tr style={{background: '#f8f9fa', position: 'sticky', top: 0}}>
                              {Object.keys(data[0] || {}).map(header => (
                                <th key={header} style={{
                                  padding: '0.75rem',
                                  textAlign: 'left',
                                  borderBottom: '1px solid #dee2e6',
                                  fontWeight: '600',
                                  color: '#495057'
                                }}>
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {data.slice(0, 5).map((row, index) => (
                              <tr key={index} style={{
                                borderBottom: '1px solid #f1f3f4'
                              }}>
                                {Object.values(row).map((value, cellIndex) => (
                                  <td key={cellIndex} style={{
                                    padding: '0.75rem',
                                    color: '#495057'
                                  }}>
                                    {String(value)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {data.length > 5 && (
                          <div style={{
                            padding: '1rem',
                            textAlign: 'center',
                            color: '#6c757d',
                            background: '#f8f9fa',
                            fontStyle: 'italic'
                          }}>
                            ... and {data.length - 5} more records
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

export default App;
