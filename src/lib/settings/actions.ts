"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth/currentUser";
import type { Category } from "@/lib/categories";
import { parseHiddenCategories, serializeHiddenCategories } from "@/lib/categoryPrefs";
import {
  addMutedKeyword,
  parseMutedKeywords,
  removeMutedKeyword,
  serializeMutedKeywords,
} from "@/lib/mutedKeywords";
import { prisma } from "@/lib/prisma";

export async function setCategoryVisibility(category: Category, visible: boolean) {
  const userId = await getCurrentUserId();
  if (!userId) return;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { hiddenCategories: true } });
  const hidden = new Set(parseHiddenCategories(user?.hiddenCategories ?? ""));

  if (visible) hidden.delete(category);
  else hidden.add(category);

  await prisma.user.update({
    where: { id: userId },
    data: { hiddenCategories: serializeHiddenCategories([...hidden]) },
  });

  revalidatePath("/");
}

// phrases are matched when the feed is read, so adding or removing one takes
// effect on the next page load — no re-classification needed
async function updateMutedKeywords(change: (current: string[]) => string[]): Promise<string[] | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { mutedKeywords: true } });
  const next = change(parseMutedKeywords(user?.mutedKeywords ?? ""));
  await prisma.user.update({ where: { id: userId }, data: { mutedKeywords: serializeMutedKeywords(next) } });

  revalidatePath("/");
  return next;
}

export async function addMutedKeywordAction(raw: string): Promise<string[] | null> {
  return updateMutedKeywords((current) => addMutedKeyword(current, String(raw)));
}

export async function removeMutedKeywordAction(keyword: string): Promise<string[] | null> {
  return updateMutedKeywords((current) => removeMutedKeyword(current, String(keyword)));
}
