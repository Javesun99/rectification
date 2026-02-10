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

    console.log(`[Import] Request received: isAppend=${isAppend}, count=${data?.length}`);

    // Common Validation
    if (!mapping || !data || !Array.isArray(data)) {
      return NextResponse.json({ error: 'Invalid data format or missing required fields' }, { status: 400 });
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

      const targetBatchIdNum = Number(batchId);

      const batch = await prisma.importBatch.findUnique({
        where: { id: targetBatchIdNum },
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
            // Extract pre-filled submission data (Fix: logic was missing in Append mode)
            const submission: Record<string, any> = {};
            let hasPrefill = false;

            Object.keys(mapping).forEach(header => {
                const typeDef = mapping[header];
                if (typeDef && typeDef.startsWith('prefill')) {
                    // Try exact match, then loose match
                    let cellVal = row[header];
                    if (cellVal === undefined || cellVal === null) {
                        // Fallback: case-insensitive trim match
                        const normalizedHeader = header.trim().toLowerCase();
                        const actualKey = Object.keys(row).find(k => k.trim().toLowerCase() === normalizedHeader);
                        if (actualKey) cellVal = row[actualKey];
                    }

                    if (cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== '') {
                        submission[header] = cellVal;
                        hasPrefill = true;
                    }
                }
            });

          newTasks.push({
            batchId: Number(batchId),
            county: String(row[countyKey] || 'Unknown'),
            reference_json: JSON.stringify(row),
            submission_json: hasPrefill ? JSON.stringify(submission) : null,
            status: hasPrefill ? 'submitted' : 'pending',
            submittedAt: hasPrefill ? new Date() : null
          });
          // Add to set to prevent duplicates within the new upload itself
          if (val) existingValues.add(val);
        }
      });

      if (newTasks.length > 0) {
        // Create in chunks
        const BATCH_SIZE = 500;
        for (let i = 0; i < newTasks.length; i += BATCH_SIZE) {
          const chunk = newTasks.slice(i, i + BATCH_SIZE);
          await prisma.task.createMany({
            data: chunk
          });
        }
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
        }
      });

      // Create tasks in chunks to avoid "parameter too many" error
      const BATCH_SIZE = 500;
      const tasksToCreate = data.map((row: any) => {
        // Extract pre-filled submission data
        const submission: Record<string, any> = {};
        let hasPrefill = false;

        // Iterate through mapping to find 'prefill' fields
        // Format: "prefill|TargetField" or just use the header name if we map it to 'prefill'
        // Actually, frontend will send mapping like { "ExcelHeader": "prefill" }
        // But we need to know what field in submission it corresponds to.
        // Option 1: The Excel Header IS the submission key.
        // Option 2: Frontend sends specific config.

        // Let's assume: If mapping type is 'prefill', we copy the value to submission_json
        // using the SAME key as the Excel header (or we can clean it).

        Object.keys(mapping).forEach(header => {
            const typeDef = mapping[header];
            if (typeDef.startsWith('prefill')) {
                // Try exact match, then loose match (Robustness Fix)
                let val = row[header];
                if (val === undefined || val === null) {
                    const normalizedHeader = header.trim().toLowerCase();
                    const actualKey = Object.keys(row).find(k => k.trim().toLowerCase() === normalizedHeader);
                    if (actualKey) val = row[actualKey];
                }

                if (val !== undefined && val !== null && String(val).trim() !== '') {
                    submission[header] = val;
                    hasPrefill = true;
                }
            }
        });

        return {
          batchId: batch.id,
          county: String(row[countyKey] || 'Unknown'),
          reference_json: JSON.stringify(row),
          submission_json: hasPrefill ? JSON.stringify(submission) : null,
          status: hasPrefill ? 'submitted' : 'pending', // Auto-submit if prefilled? Or just keep as pending but filled?
          // User requirement: "exists info... import in". Usually this means "already done".
          // Let's assume status becomes 'submitted' if we have prefill data?
          // Or maybe just 'pending' but with draft?
          // "存在信息" -> implied "Historical data migration".
          // If we mark as 'submitted', they won't show in Todo list.
          // Let's set to 'submitted' if prefill exists, assuming it's a completed task record.
          // Update: User said "import in", didn't specify status.
          // Safest: 'submitted' if prefill is present, so it shows in "Completed".
          // But wait, what if only PARTIAL info is present?
          // Let's stick to: If ANY prefill data, mark as 'submitted'.
          // Wait, 'submittedAt' should be set too.
          submittedAt: hasPrefill ? new Date() : null
        };
      });

      for (let i = 0; i < tasksToCreate.length; i += BATCH_SIZE) {
        const chunk = tasksToCreate.slice(i, i + BATCH_SIZE);
        await prisma.task.createMany({
          data: chunk
        });
      }

      return NextResponse.json({ success: true, batchId: batch.id, count: data.length });
    }

  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
