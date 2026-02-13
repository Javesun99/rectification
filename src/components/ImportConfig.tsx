import { useState } from 'react';
import ExcelJS from 'exceljs';
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
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [workbook, setWorkbook] = useState<ExcelJS.Workbook | null>(null);

  useState(() => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      setWorkbook(wb);

      const names = wb.worksheets.map(ws => ws.name);
      setSheetNames(names);

      if (names.length > 0) {
        setSelectedSheet(names[0]);
        loadSheet(wb, names[0]);
      }
    };
    reader.readAsArrayBuffer(file);
  });

  const loadSheet = (wb: ExcelJS.Workbook, name: string) => {
    const ws = wb.getWorksheet(name);
    if (!ws) return;

    const rows: any[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      if (rowNumber <= 10) {
        const values: any[] = [];
        for (let c = 1; c <= ws.columnCount; c++) {
          const cell = row.getCell(c);
          values.push(cell.value != null ? String(cell.value) : '');
        }
        rows.push(values);
      }
    });
    setPreviewData(rows);
  };

  const handleSheetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    setSelectedSheet(name);
    if (workbook) {
      loadSheet(workbook, name);
    }
  };

  const handleParse = () => {
    if (!workbook) return;
    const ws = workbook.getWorksheet(selectedSheet);
    if (!ws) return;

    let finalHeaders: string[] = [];

    const getRowValues = (rowNum: number): string[] => {
      const row = ws.getRow(rowNum);
      const values: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        values.push(String(row.getCell(c).value ?? '').trim());
      }
      return values;
    };

    if (enableMerge) {
      const headerRows: string[][] = [];
      for (let r = headerRow; r < dataStartRow; r++) {
        headerRows.push(getRowValues(r));
      }

      const merges = ws.model.merges || [];
      const mergeRanges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
      merges.forEach((m: string) => {
        const decoded = decodeMergeRange(m);
        if (decoded) mergeRanges.push(decoded);
      });

      const numCols = ws.columnCount;
      const lastValues: string[] = new Array(headerRows.length).fill('');

      for (let c = 0; c < numCols; c++) {
        const parts: string[] = [];
        let hasOwnValue = false;

        for (let r = 0; r < headerRows.length; r++) {
          const rawVal = headerRows[r][c];
          if (rawVal) hasOwnValue = true;
        }

        for (let r = 0; r < headerRows.length; r++) {
          const rawVal = headerRows[r][c];

          if (rawVal) {
            lastValues[r] = rawVal;
            parts.push(rawVal);
          } else {
            const absRow = (headerRow - 1) + r;
            const absCol = c;

            const isMerged = mergeRanges.some(range =>
              absRow >= range.s.r && absRow <= range.e.r &&
              absCol >= range.s.c && absCol <= range.e.c &&
              range.s.c < absCol
            );

            if (isMerged && lastValues[r]) {
              parts.push(lastValues[r]);
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

      finalHeaders = deduplicateHeaders(finalHeaders);
    } else {
      let rawHeaders = getRowValues(headerRow).map((h, i) => h || `Column_${i + 1}`);
      finalHeaders = deduplicateHeaders(rawHeaders);
    }

    const jsonData: Record<string, any>[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber < dataStartRow) return;

      const obj: Record<string, any> = {};
      for (let c = 0; c < finalHeaders.length; c++) {
        const cell = row.getCell(c + 1);
        obj[finalHeaders[c]] = cell.value != null ? String(cell.value) : '';
      }
      jsonData.push(obj);
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

function decodeMergeRange(ref: string) {
  const match = ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!match) return null;
  return {
    s: { r: parseInt(match[2]) - 1, c: colToIndex(match[1]) },
    e: { r: parseInt(match[4]) - 1, c: colToIndex(match[3]) }
  };
}

function colToIndex(col: string): number {
  let idx = 0;
  for (let i = 0; i < col.length; i++) {
    idx = idx * 26 + (col.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function deduplicateHeaders(headers: string[]): string[] {
  const result: string[] = [];
  const counts: Record<string, number> = {};
  headers.forEach(h => {
    if (counts[h]) {
      counts[h]++;
      result.push(`${h}_${counts[h]}`);
    } else {
      counts[h] = 1;
      result.push(h);
    }
  });
  return result;
}
