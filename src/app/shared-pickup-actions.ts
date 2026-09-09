'use server';
import { requireUser } from '@/lib/auth';
import { transaction } from '@/lib/db';
import { sharePickupSchool } from '@/lib/shared-pickups';
import { revalidatePath } from 'next/cache';
export async function configureSharedPickup(form:FormData) {
 const user=await requireUser(['ADMIN']);
 await transaction(c=>sharePickupSchool(c,user,[String(form.get('first')),String(form.get('second'))],String(form.get('school'))));
 revalidatePath('/');revalidatePath('/driver');
}
