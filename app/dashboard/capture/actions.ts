"use server";

import { requireSession } from "@/lib/session";

import { ObservationStatus } from "@/lib/generated/prisma/enums";
import { getPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

function refresh() {
  revalidatePath("/dashboard/capture");
}

function content(formData: FormData) {
  const value = String(formData.get("content") ?? "").trim();
  if (!value) throw new Error("An observation needs content.");
  return value;
}

function brandId(formData: FormData) {
  const value = String(formData.get("brandId") ?? "").trim();
  if (!value) throw new Error("Pick a brand for this observation.");
  return value;
}

export async function createObservation(formData: FormData) {
  await requireSession();

  await getPrisma().observation.create({
    data: { brandId: brandId(formData), content: content(formData) },
  });
  refresh();
}

export async function updateObservation(
  observationId: string,
  formData: FormData,
) {
  await requireSession();

  const rawStatus = String(formData.get("status") ?? ObservationStatus.NEW);
  if (!Object.values(ObservationStatus).includes(rawStatus as ObservationStatus)) {
    throw new Error("Unknown observation status.");
  }

  await getPrisma().observation.update({
    where: { id: observationId },
    data: {
      brandId: brandId(formData),
      content: content(formData),
      status: rawStatus as ObservationStatus,
    },
  });
  refresh();
}

export async function setObservationStatus(
  observationId: string,
  status: ObservationStatus,
) {
  await requireSession();

  await getPrisma().observation.update({
    where: { id: observationId },
    data: { status },
  });
  refresh();
}

export async function archiveObservation(observationId: string) {
  await requireSession();

  await setObservationStatus(observationId, ObservationStatus.ARCHIVED);
}

export async function restoreObservation(observationId: string) {
  await requireSession();

  await setObservationStatus(observationId, ObservationStatus.NEW);
}

export async function deleteObservation(observationId: string) {
  await requireSession();

  await getPrisma().observation.delete({ where: { id: observationId } });
  refresh();
}
