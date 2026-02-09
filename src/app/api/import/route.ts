import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    const user = token ? await verifyToken(token) : null;

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = Number(user.id);
    const userRole = (user as any).role;

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

      // Permission Check
      // Superadmin can edit all.
      // Admin can only edit their own (creatorId matches).
      // For legacy batches (creatorId is null), we allow all admins (or maybe restrict to superadmin? Let's allow all for backward compatibility if desired, or restrict. 
      // Given the requirement "only see their own", legacy batches (null) shouldn't be visible to them if we are strict.
      // Let's assume strict ownership for new feature. Legacy batches will only be visible/editable by Superadmin unless we migrate them.
      // But to avoid breaking existing workflow for admins, maybe legacy batches are "public" to admins?
      // Let's stick to strict: If you didn't create it, you can't touch it. (Legacy batches -> Superadmin only).
      if (userRole !== 'superadmin' && batch.creatorId !== userId) {
         // Special case: If batch.creatorId is null, it's a legacy batch. 
         // If we want to allow admins to claim them? No.
         return NextResponse.json({ error: 'Permission denied: You do not own this batch' }, { status: 403 });
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
        // Use the first row to validate keys.
        // NOTE: ExcelJS or frontend parsing might omit keys with undefined/null values in the first row.
        // We should check if the keys exist in the 'mapping' (which comes from config)
        // But 'mapping' is passed from frontend.
        // The 'data' array objects might not have keys for empty cells.
        
        // Strategy: Iterate over all rows (or a sample) to see if keys are ever present?
        // Better Strategy: The frontend sends 'data' as an array of objects.
        // If a column is empty in a row, the key might be missing in that object.
        // We should rely on the frontend validation of *Headers* which we just enforced.
        // However, to be safe, we can check if the *Union* of all keys in data matches config?
        // Or simply trust that if frontend passed header check, the data structure is correct 
        // even if some specific cells are empty (missing keys in JSON).
        
        // Let's relax this check slightly: only check if keys are missing from *mapping* (which we validated against config).
        // But we already did that with `missingKeys`.
        
        // The previous strict check `!firstRowKeys.includes(k)` fails if the first row has an empty cell for a required column.
        // We should skip this data-level key check because `data` objects are sparse by default.
        // The critical check is `missingKeys` (config vs mapping) and the Frontend Header check.
        
        /* 
        const firstRowKeys = Object.keys(data[0]);
        const requiredKeys = Object.keys(config);
        const missingDataKeys = requiredKeys.filter(k => !firstRowKeys.includes(k));
        
        if (missingDataKeys.length > 0) {
           // This is too strict for sparse data
           // return NextResponse.json({ ... }); 
        }
        */
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
          creatorId: userId,
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
