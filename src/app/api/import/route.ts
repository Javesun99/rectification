import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, mapping, data, isAppend, batchId, uniqueKey } = body;

    // Common Validation
    if (!mapping || !data || !Array.isArray(data)) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    // Find which key maps to 'county'
    const countyKey = Object.keys(mapping).find(key => mapping[key].startsWith('county'));
    if (!countyKey) {
      return NextResponse.json({ error: 'Must map a column to County/Permission Scope' }, { status: 400 });
    }

    if (isAppend) {
      // Append Mode Logic
      if (!batchId || !uniqueKey) {
        return NextResponse.json({ error: 'Batch ID and Unique Key required for append mode' }, { status: 400 });
      }

      const batch = await prisma.importBatch.findUnique({
        where: { id: Number(batchId) },
        include: { tasks: true }
      });

      if (!batch) {
        return NextResponse.json({ error: 'Target batch not found' }, { status: 404 });
      }

      // Validate that new tasks conform to the original batch configuration
      let config: Record<string, string>;
      try {
        config = JSON.parse(batch.config_json);
      } catch (e) {
        return NextResponse.json({ error: 'Target batch configuration is invalid' }, { status: 500 });
      }

      // Check if all keys in config exist in the new mapping
      // And if the types match (roughly)
      const missingKeys = Object.keys(config).filter(key => !mapping[key]);
      if (missingKeys.length > 0) {
        return NextResponse.json({ 
          error: `追加数据的列结构与原批次不一致。缺少列: ${missingKeys.join(', ')}` 
        }, { status: 400 });
      }

      // Optionally check if types match (e.g. if original was 'image', new should be 'image')
      const typeMismatch = Object.keys(config).filter(key => {
        const originalType = config[key].split('|')[0];
        const newType = mapping[key].split('|')[0];
        return originalType !== newType;
      });

      if (typeMismatch.length > 0) {
        return NextResponse.json({
          error: `列类型不匹配: ${typeMismatch.map(k => `${k} (原: ${config[k]} -> 新: ${mapping[k]})`).join(', ')}`
        }, { status: 400 });
      }

      // Check if data rows actually have the keys specified in config
      if (data.length > 0) {
        const firstRowKeys = Object.keys(data[0]);
        const requiredKeys = Object.keys(config);
        const missingDataKeys = requiredKeys.filter(k => !firstRowKeys.includes(k));
        
        if (missingDataKeys.length > 0) {
           return NextResponse.json({ 
             error: `上传的 Excel 数据列与原批次不匹配。缺少列: ${missingDataKeys.join(', ')}` 
           }, { status: 400 });
        }
      }

      // Deduplication Logic
      const existingValues = new Set<string>();
      batch.tasks.forEach(task => {
        try {
          const ref = JSON.parse(task.reference_json);
          if (ref[uniqueKey]) {
            existingValues.add(String(ref[uniqueKey]).trim());
          }
        } catch (e) {}
      });

      const newTasks: any[] = [];
      let skippedCount = 0;

      data.forEach((row: any) => {
        const val = row[uniqueKey] ? String(row[uniqueKey]).trim() : '';
        if (val && existingValues.has(val)) {
          skippedCount++;
        } else {
          newTasks.push({
            batchId: Number(batchId),
            county: String(row[countyKey] || 'Unknown'),
            reference_json: JSON.stringify(row),
            status: 'pending'
          });
          // Add to set to prevent duplicates within the new upload itself
          if (val) existingValues.add(val);
        }
      });

      if (newTasks.length > 0) {
        await prisma.task.createMany({
          data: newTasks
        });
      }

      return NextResponse.json({ 
        success: true, 
        count: newTasks.length, 
        skipped: skippedCount,
        batchId: batch.id 
      });

    } else {
      // Create New Batch Logic (Existing)
      if (!name) return NextResponse.json({ error: 'Batch name required' }, { status: 400 });

      // Check for duplicate batch name
      const existingBatch = await prisma.importBatch.findFirst({
        where: { name }
      });
      if (existingBatch) {
        return NextResponse.json({ error: '任务批次名称已存在，请使用其他名称' }, { status: 400 });
      }

      // Create Batch
      const batch = await prisma.importBatch.create({
        data: {
          name,
          config_json: JSON.stringify(mapping),
          tasks: {
            create: data.map((row: any) => ({
              county: String(row[countyKey] || 'Unknown'),
              reference_json: JSON.stringify(row),
              status: 'pending'
            }))
          }
        }
      });

      return NextResponse.json({ success: true, batchId: batch.id, count: data.length });
    }

  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
