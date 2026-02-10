import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Settings2, ArrowRight } from 'lucide-react';

interface ImportConfigProps {
  file: File;
  onParsed: (headers: string[], data: any[]) => void;
  onCancel: () => void;
}

export default function ImportConfig({ file, onParsed, onCancel }: ImportConfigProps) {
  const [headerRow, setHeaderRow] = useState<number>(1);
  const [dataStartRow, setDataStartRow] = useState<number>(2);
  const [enableMerge, setEnableMerge] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<any[][]>([]);
  const [worksheet, setWorksheet] = useState<XLSX.WorkSheet | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);

  // Load preview immediately
  useState(() => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array' });
      setWorkbook(wb);
      setSheetNames(wb.SheetNames);
      
      if (wb.SheetNames.length > 0) {
        const firstSheetName = wb.SheetNames[0];
        setSelectedSheet(firstSheetName);
        loadSheet(wb, firstSheetName);
      }
    };
    reader.readAsArrayBuffer(file);
  });

  const loadSheet = (wb: XLSX.WorkBook, name: string) => {
      const ws = wb.Sheets[name];
      // Convert to array of arrays to show raw structure
      const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
      setPreviewData(jsonData.slice(0, 10)); // Preview first 10 rows
      setWorksheet(ws);
  };

  const handleSheetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    setSelectedSheet(name);
    if (workbook) {
      loadSheet(workbook, name);
    }
  };

  const handleParse = () => {
    if (!worksheet) return;

    let finalHeaders: string[] = [];
    
    // Parse Headers
    if (enableMerge) {
      // Logic for merged headers: from headerRow to dataStartRow - 1
      const headerRows = previewData.slice(headerRow - 1, dataStartRow - 1);
      
      // Get merge ranges from worksheet to distinguish between "Merged" and "Empty"
      const merges = worksheet['!merges'] || [];
      
      // Transpose and join
      const numCols = headerRows[0]?.length || 0;
      let lastValues: string[] = new Array(headerRows.length).fill('');

      for (let c = 0; c < numCols; c++) {
        const parts: string[] = [];
        let hasOwnValue = false; 

        for (let r = 0; r < headerRows.length; r++) {
          const rawVal = String(headerRows[r][c] || '').trim();
          if (rawVal) hasOwnValue = true;
        }

        for (let r = 0; r < headerRows.length; r++) {
          const rawVal = String(headerRows[r][c] || '').trim();
          
          if (rawVal) {
             lastValues[r] = rawVal;
             parts.push(rawVal);
          } else {
             // Check if this cell is actually part of a merge range that started to the left
             // Current cell coordinates (0-based relative to sheet):
             // Row = (headerRow - 1) + r
             // Col = c
             const absRow = (headerRow - 1) + r;
             const absCol = c;
             
             const isMerged = merges.some((range: XLSX.Range) => {
                 // Check if current cell is inside a merge range
                 // AND that range started strictly to the left (range.s.c < absCol)
                 // AND covers this row
                 return absRow >= range.s.r && absRow <= range.e.r && 
                        absCol >= range.s.c && absCol <= range.e.c &&
                        range.s.c < absCol; // Ensure it's a horizontal merge from left
             });

             if (isMerged && lastValues[r]) {
                 parts.push(lastValues[r]);
             } else {
                 // Not merged, so it's a genuine empty parent header.
                 // Do not inherit.
                 // This solves the "unrelated column" issue.
             }
          }
        }
        
        const headerName = parts.join('_');
        if (headerName) {
            finalHeaders.push(headerName);
        } else if (hasOwnValue) {
            finalHeaders.push(`Column_${c + 1}`);
        }
      }

      // Fix for duplicate keys react warning:
      // Ensure all headers are unique.
      const uniqueHeaders: string[] = [];
      const counts: Record<string, number> = {};
      
      finalHeaders.forEach(h => {
          if (counts[h]) {
              counts[h]++;
              uniqueHeaders.push(`${h}_${counts[h]}`);
          } else {
              counts[h] = 1;
              uniqueHeaders.push(h);
          }
      });
      finalHeaders = uniqueHeaders;
    } else {
      // Single header row
      let rawHeaders = previewData[headerRow - 1].map((h: any, i: number) => 
        String(h || '').trim() || `Column_${i + 1}`
      );

      // Fix for duplicate keys react warning (also for single row)
      const uniqueHeaders: string[] = [];
      const counts: Record<string, number> = {};
      
      rawHeaders.forEach(h => {
          if (counts[h]) {
              counts[h]++;
              uniqueHeaders.push(`${h}_${counts[h]}`);
          } else {
              counts[h] = 1;
              uniqueHeaders.push(h);
          }
      });
      finalHeaders = uniqueHeaders;
    }

    // Parse Data
    // We re-parse using XLSX utils with range option for safety
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    range.s.r = dataStartRow - 1; // Start from data row (0-based)
    
    // Custom data extraction to map to our calculated headers
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
      header: finalHeaders, 
      range: range,
      defval: ''
    });

    onParsed(finalHeaders, jsonData);
  };

  return (
    <Card className="mb-6 border-primary/50 shadow-md">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Settings2 className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-lg">Excel 解析配置</h3>
        </div>
        
        {/* Sheet Selection */}
        {sheetNames.length > 1 && (
          <div className="mb-4">
            <label className="text-sm font-medium">选择工作表 (Sheet)</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
              value={selectedSheet}
              onChange={handleSheetChange}
            >
              {sheetNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium">表头所在行 (Header Row)</label>
            <input 
              type="number" min="1" 
              className="flex h-10 w-full rounded-md border border-input px-3"
              value={headerRow}
              onChange={e => setHeaderRow(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="text-sm font-medium">数据起始行 (Data Start)</label>
            <input 
              type="number" min="2" 
              className="flex h-10 w-full rounded-md border border-input px-3"
              value={dataStartRow}
              onChange={e => setDataStartRow(Number(e.target.value))}
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                className="w-4 h-4 rounded border-primary text-primary"
                checked={enableMerge}
                onChange={e => setEnableMerge(e.target.checked)}
              />
              <span className="text-sm font-medium">启用多级表头合并</span>
            </label>
          </div>
        </div>

        {/* Preview Area */}
        <div className="border rounded-md overflow-x-auto bg-muted/10 p-2">
          <p className="text-xs text-muted-foreground mb-2">原始数据预览 (前10行):</p>
          <table className="w-full text-xs border-collapse">
            <tbody>
              {previewData.map((row, rIndex) => {
                const rowNum = rIndex + 1;
                let bgClass = '';
                if (rowNum === headerRow) bgClass = 'bg-blue-100 dark:bg-blue-900/30 font-bold';
                else if (enableMerge && rowNum > headerRow && rowNum < dataStartRow) bgClass = 'bg-blue-50 dark:bg-blue-900/20 font-semibold';
                else if (rowNum >= dataStartRow) bgClass = 'bg-green-50/50 dark:bg-green-900/10';

                return (
                  <tr key={rIndex} className={bgClass}>
                    <td className="border p-1 text-center w-8 text-muted-foreground">{rowNum}</td>
                    {row.map((cell: any, cIndex: number) => (
                      <td key={cIndex} className="border p-1 whitespace-nowrap max-w-[150px] truncate">
                        {String(cell)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onCancel}>取消上传</Button>
          <Button onClick={handleParse} className="gap-2">
            下一步：确认映射 <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
