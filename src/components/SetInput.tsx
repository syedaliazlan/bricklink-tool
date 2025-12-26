'use client';

import { useState, useRef } from 'react';
import { parseCSVFile } from '@/lib/utils/validation';
import { AlertCircle, Upload, FileText, X } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

interface SetInputProps {
  onLookupStart: (sets: Array<{ setNumber: string; condition: 'new' | 'used' }>, forceRefresh: boolean) => void;
}

export function SetInput({ onLookupStart }: SetInputProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedSets, setParsedSets] = useState<Array<{ setNumber: string; condition: 'new' | 'used' }>>([]);
  const [errors, setErrors] = useState<Array<{ line: string; error: string }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    const fileName = file.name.toLowerCase();
    const isCSV = fileName.endsWith('.csv');
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    if (!isCSV && !isExcel) {
      alert('Please select a CSV or Excel file (.csv, .xlsx, .xls)');
      return;
    }

    setSelectedFile(file);
    setErrors([]);
    setParsedSets([]);

    try {
      let data: any[] = [];

      if (isCSV) {
        // Parse CSV file
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            data = results.data;
            const { valid, invalid } = parseCSVFile(data);
            setParsedSets(valid);
            setErrors(invalid);
          },
          error: (error) => {
            alert(`Error reading CSV: ${error.message}`);
            setSelectedFile(null);
          },
        });
      } else {
        // Parse Excel file
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        
        // Get the first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON with headers
        data = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        
        const { valid, invalid } = parseCSVFile(data);
        setParsedSets(valid);
        setErrors(invalid);
      }
    } catch (error) {
      alert(`Error reading file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setSelectedFile(null);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setParsedSets([]);
    setErrors([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (parsedSets.length === 0) {
      alert('Please upload a CSV or Excel file with valid set numbers and conditions');
      return;
    }

    if (errors.length > 0 && parsedSets.length === 0) {
      alert('No valid sets found in file. Please check the format.');
      return;
    }

    if (parsedSets.length > 600) {
      alert('Maximum 600 sets allowed per lookup');
      return;
    }

    setIsSubmitting(true);

    try {
      onLookupStart(parsedSets, forceRefresh);
    } catch (error) {
      console.error('[SetInput] Error starting lookup:', error);
      alert(error instanceof Error ? error.message : 'Failed to start lookup');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="card max-w-4xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* File Upload Area */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            Upload CSV or Excel File
          </label>
          
          {!selectedFile ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-300 hover:border-indigo-400 bg-gray-50'
              }`}
            >
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-700 font-medium mb-2">
                Drag and drop your CSV or Excel file here, or click to browse
              </p>
              <p className="text-sm text-gray-500 mb-4">
                Supports CSV (.csv) and Excel (.xlsx, .xls) files with set numbers and conditions
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileInput}
                className="hidden"
                id="file-upload"
                disabled={isSubmitting}
              />
              <label
                htmlFor="file-upload"
                className="btn btn-primary inline-flex items-center cursor-pointer"
              >
                <FileText className="w-5 h-5 mr-2" />
                Choose File
              </label>
            </div>
          ) : (
            <div className="border-2 border-indigo-200 rounded-xl p-4 bg-indigo-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <FileText className="w-8 h-8 text-indigo-600" />
                  <div>
                    <p className="font-medium text-gray-900">{selectedFile.name}</p>
                    <p className="text-sm text-gray-600">
                      {parsedSets.length} valid set{parsedSets.length !== 1 ? 's' : ''} found
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                  disabled={isSubmitting}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* File Format Instructions */}
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-medium text-blue-900 mb-2">File Format Requirements:</p>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Supports CSV (.csv) and Excel (.xlsx, .xls) files</li>
              <li>First row should contain headers (e.g., &quot;Set&quot;, &quot;Set Number&quot;, &quot;Set ID&quot;, &quot;Condition&quot;)</li>
              <li>Set numbers can be numeric (e.g., 75158) or full format (e.g., 10188-1)</li>
              <li>Condition values: &quot;new&quot;, &quot;used&quot;, &quot;New&quot;, &quot;Used&quot;, &quot;N&quot;, or &quot;U&quot;</li>
              <li>Maximum 600 sets per file</li>
            </ul>
            <div className="mt-3 p-2 bg-white rounded border border-blue-200">
              <p className="text-xs font-mono text-gray-700">
                Example 1: Set,Condition<br />
                75158,new<br />
                75142,used<br />
                75195,New<br /><br />
                Example 2: Set Number,Condition<br />
                10188-1,new<br />
                75192-1,used<br />
                10294-1,New
              </p>
            </div>
          </div>
        </div>

        {/* Validation Errors */}
        {errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-2 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-800 mb-2">
                  Invalid Rows Found ({errors.length})
                </h3>
                <ul className="text-sm text-red-700 space-y-1 max-h-40 overflow-y-auto">
                  {errors.slice(0, 10).map((err, i) => (
                    <li key={i}>
                      <span className="font-mono">{err.line}</span> - {err.error}
                    </li>
                  ))}
                  {errors.length > 10 && (
                    <li className="text-red-600 font-medium">
                      ...and {errors.length - 10} more error{errors.length - 10 !== 1 ? 's' : ''}
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Force Refresh Option */}
        <div className="flex items-center p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <input
            type="checkbox"
            id="force-refresh"
            checked={forceRefresh}
            onChange={(e) => setForceRefresh(e.target.checked)}
            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            disabled={isSubmitting}
          />
          <label htmlFor="force-refresh" className="ml-2 text-sm text-amber-900 cursor-pointer">
            <span className="font-medium">Force Refresh</span> - Bypass cache and fetch fresh data from BrickLink API
          </label>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting || parsedSets.length === 0}
          className="btn btn-primary w-full text-lg py-3.5 font-semibold shadow-md hover:shadow-lg transition-shadow"
        >
          {isSubmitting ? (
            <>
              <span className="inline-block animate-spin mr-2">⏳</span>
              Processing Lookup...
            </>
          ) : (
            <>
              <Upload className="inline-block w-5 h-5 mr-2" />
              Start Lookup ({parsedSets.length} set{parsedSets.length !== 1 ? 's' : ''})
            </>
          )}
        </button>
      </form>
    </div>
  );
}

