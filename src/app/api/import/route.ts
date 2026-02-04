import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, mapping, data } = body;

    // Validate
    if (!name || !mapping || !data || !Array.isArray(data)) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    // Check for duplicate batch name
    const existingBatch = await prisma.importBatch.findFirst({
      where: { name }
    });
    if (existingBatch) {
      return NextResponse.json({ error: '任务批次名称已存在，请使用其他名称' }, { status: 400 });
    }

    // Find which key maps to 'county'
    const countyKey = Object.keys(mapping).find(key => mapping[key].startsWith('county'));
    if (!countyKey) {
      return NextResponse.json({ error: 'Must map a column to County/Permission Scope' }, { status: 400 });
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
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
