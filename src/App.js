// Handle reconciliation process (now works locally)
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

      // Step 2: Perform reconciliation locally (no external service needed)
      console.log('🔄 Performing local reconciliation...');
      
      const reconciliationResults = performLocalReconciliation(processedData.data, {
        reconciliationType,
        selectedUser,
        dateRange,
        filesProcessed: processedData.filesProcessed,
        totalRecords: processedData.totalRecords
      });

      // Include the processed data in results for file info display
      const enhancedResults = {
        ...reconciliationResults,
        processedData: processedData.data
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
  };import React, { useState, useEffect } from 'react';
import ExcelJS from 'exceljs';

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

  // Real file processing without sample data
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

        try {
          let extractedData = [];
          let status = 'File read successfully';
          let errorDetails = null;

          if (fileType === 'ims' && file.name.toLowerCase().endsWith('.zip')) {
            const result = await processZipFile(file);
            extractedData = result.data;
            if (result.error) {
              errorDetails = result.error;
              status = 'ZIP file detected but extraction requires JSZip library';
            }
          } else if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
            const result = await processExcelFile(file, fileType);
            extractedData = result.data;
            if (result.error) {
              errorDetails = result.error;
              status = 'Excel file detected but processing requires ExcelJS/SheetJS library';
            }
          } else if (file.name.toLowerCase().endsWith('.csv')) {
            const result = await processCsvFile(file, fileType);
            extractedData = result.data;
            if (result.error) {
              errorDetails = result.error;
              status = `CSV processing error: ${result.error}`;
            }
          } else {
            throw new Error('Unsupported file format. Please upload .xlsx, .xls, .csv, or .zip files.');
          }

          // Only add to processed data if we actually extracted something
          if (extractedData && extractedData.length > 0) {
            processedData[fileType] = extractedData;
            hasProcessedData = true;
            status = `Successfully extracted ${extractedData.length} records`;
          } else if (errorDetails && errorDetails.includes('convert')) {
            // Special handling for Excel files that need conversion
            status = `Excel file detected - please save as CSV format for data extraction`;
          }

          // Store file information
          processedData.fileInfo.push({
            type: fileType,
            name: file.name,
            size: file.size,
            lastModified: new Date(file.lastModified).toLocaleString(),
            mimeType: file.type,
            recordsExtracted: extractedData ? extractedData.length : 0,
            status: status,
            error: errorDetails
          });

          console.log(`✅ ${fileType}: ${status}`);
          
        } catch (fileError) {
          console.error(`❌ Error processing ${fileType}:`, fileError);
          processedData.fileInfo.push({
            type: fileType,
            name: file.name,
            size: file.size,
            lastModified: new Date(file.lastModified).toLocaleString(),
            mimeType: file.type,
            recordsExtracted: 0,
            status: `Error: ${fileError.message}`,
            error: fileError.message
          });
        }
      }

      // Check if we have any actual data to process
      const totalRecords = processedData.ims.length + 
                          processedData.gstr2a.length + 
                          processedData.gstr2b.length + 
                          processedData.purchaseRegister.length + 
                          processedData.logitaxPurchase.length;

      if (totalRecords === 0) {
        // Check if files were uploaded but couldn't be processed due to missing libraries
        const hasFiles = processedData.fileInfo.length > 0;
        const needsLibraries = processedData.fileInfo.some(info => 
          info.status.includes('requires') || info.status.includes('library')
        );

        let errorMessage = 'No data could be extracted from uploaded files.';
        
        if (needsLibraries) {
          errorMessage += ' Some files may require additional libraries. For ZIP files, install JSZip: npm install jszip';
        } else if (hasFiles) {
          errorMessage += ' Please check that your files contain valid data and are in the correct format.';
        }

        return {
          success: false,
          error: errorMessage,
          data: processedData,
          filesProcessed: Object.keys(files).length,
          requiresLibraries: needsLibraries
        };
      }

      return {
        success: true,
        data: processedData,
        processedAt: new Date().toISOString(),
        filesProcessed: Object.keys(files).length,
        totalRecords: totalRecords
      };

    } catch (error) {
      console.error('❌ File processing failed:', error);
      return {
        success: false,
        error: `File processing failed: ${error.message}`
      };
    }
  };

  // Process ZIP files (requires JSZip - install with: npm install jszip)
  const processZipFile = async (file) => {
    try {
      console.log('📦 Processing ZIP file...');
      
      // For now, ZIP processing requires additional setup
      // This will be enabled once JSZip is installed
      
      return {
        data: [],
        error: 'ZIP file detected. To enable ZIP processing, please install JSZip: npm install jszip'
      };
      
    } catch (error) {
      console.error(`❌ ZIP processing error:`, error);
      return {
        data: [],
        error: error.message
      };
    }
  };

  // Helper function to process CSV text
  const processCsvText = async (text) => {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error('CSV content is empty');
      }

      const data = parseCSV(text);
      return {
        data: data,
        error: null
      };
    } catch (error) {
      return {
        data: [],
        error: error.message
      };
    }
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
  const readFileAsArrayBuffer = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        resolve(e.target.result);
      };
      
      reader.onerror = (e) => {
        reject(new Error(`Failed to read file: ${file.name}`));
      };

      reader.readAsArrayBuffer(file);
    });
  };

  // Read file as text
  const readFileAsText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        resolve(e.target.result);
      };
      
      reader.onerror = (e) => {
        reject(new Error(`Failed to read file: ${file.name}`));
      };

      reader.readAsText(file, 'UTF-8');
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
    if (expectedType === 'excel' && !fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
      errors.push('Please upload an Excel file (.xlsx, .xls) or CSV file (.csv)');
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

      // Step 2: Send to Google Apps Script for reconciliation
      console.log('🔄 Performing reconciliation...');
      const reconciliationRequest = {
        reconciliationType,
        selectedUser,
        dateRange,
        processedData: processedData.data,
        filesProcessed: processedData.filesProcessed,
        totalRecords: processedData.totalRecords
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

          .library-info {
            background: #e6fffa;
            color: #234e52;
            padding: 16px;
            border-radius: 8px;
            border: 1px solid #81e6d9;
            margin-top: 1rem;
            font-size: 0.95rem;
            line-height: 1.5;
          }

          .library-info h4 {
            margin-bottom: 0.5rem;
            color: #2c7a7b;
          }

          .library-info code {
            background: #234e52;
            color: #81e6d9;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
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
      </>
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

          {/* File Processing Information */}
          <div className="library-info">
            <h4>📄 File Processing Capabilities:</h4>
            <p>• <strong>✅ CSV files (.csv)</strong> → Fully supported and processed immediately</p>
            <p>• <strong>✅ Excel files (.xlsx/.xls)</strong> → Fully supported using ExcelJS library</p>
            <p>• <strong>⚠️ ZIP files (.zip)</strong> → To enable: <code>npm install jszip</code></p>
            <p>• <strong>🎯 Demo Data</strong> → Click "Try Demo Data" to see the system in action!</p>
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
                <h3>❌ File Processing Issue</h3>
                <p style={{marginTop: '1rem', lineHeight: '1.6'}}>
                  {reconciliationResults.error}
                </p>
                {reconciliationResults.requiresLibraries && (
                  <div style={{marginTop: '1rem', padding: '1rem', background: '#e3f2fd', borderRadius: '6px'}}>
                    <strong>Additional Setup:</strong> For ZIP file processing, please install JSZip: <code>npm install jszip</code>
                  </div>
                )}
              </div>
            )}
            
            {/* File Processing Info */}
            {reconciliationResults.processedData?.fileInfo && (
              <div className="file-processing-info" style={{marginBottom: '2rem'}}>
                <h3>📁 File Analysis</h3>
                <div className="processed-files-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem'}}>
                  {reconciliationResults.processedData.fileInfo.map((fileInfo, index) => (
                    <div key={index} className="processed-file-card" style={{
                      background: fileInfo.error ? '#f8d7da' : '#f8f9fa', 
                      padding: '1rem', 
                      borderRadius: '8px', 
                      border: `1px solid ${fileInfo.error ? '#f5c6cb' : '#e9ecef'}`
                    }}>
                      <div style={{fontWeight: 'bold', color: '#495057'}}>{fileInfo.type.toUpperCase()}</div>
                      <div style={{fontSize: '0.9rem', color: '#6c757d', marginTop: '0.5rem'}}>
                        📄 {fileInfo.name}<br/>
                        📏 {(fileInfo.size / 1024).toFixed(1)} KB<br/>
                        🕒 {fileInfo.lastModified}<br/>
                        📊 Records: {fileInfo.recordsExtracted}<br/>
                        <span style={{
                          color: fileInfo.error ? '#dc3545' : fileInfo.status.includes('Successfully') ? '#28a745' : '#fd7e14',
                          fontWeight: '500'
                        }}>
                          {fileInfo.error ? '❌' : fileInfo.recordsExtracted > 0 ? '✅' : '⚠️'} {fileInfo.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
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
                <h3>{reconciliationResults.isDemoData ? '🎯 Demo Data Processing Complete' : '✅ Reconciliation Completed Successfully'}</h3>
                <p style={{marginTop: '1rem'}}>
                  Total records processed: {reconciliationResults.totalRecords || 'N/A'}
                </p>
                <p>Processing completed at: {new Date(reconciliationResults.processedAt).toLocaleString()}</p>
                {reconciliationResults.isDemoData && (
                  <p style={{marginTop: '1rem', fontStyle: 'italic'}}>
                    This is demo data to show how the system works. Upload your own CSV files to process real data!
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
      </main>
    </div>
  );
}

export default App;