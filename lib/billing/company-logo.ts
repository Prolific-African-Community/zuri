import { put, del } from "@vercel/blob";
import sharp from "sharp";
import { requireValue } from "./domain";
import { saveCompany, validateCompanyWrite } from "./service";

type LogoStorage = {
  upload: (pathname: string, bytes: Buffer) => Promise<{ url: string }>;
  remove: (url: string) => Promise<void>;
};
const blobStorage: LogoStorage = {
  upload: (pathname, bytes) =>
    put(pathname, bytes, { access: "public", contentType: "image/png" }),
  remove: (url) => del(url),
};

// The same path is used by the Server Action and integration checks. Validate
// ownership and profile before any remote write; compensate a failed DB save.
export async function saveCompanyForm(
  workspaceId: string,
  form: FormData,
  storage: LogoStorage = blobStorage,
) {
  const input: unknown = JSON.parse(String(form.get("profile")));
  const prefix = String(form.get("prefix"));
  const id = String(form.get("id") || "") || undefined;
  const revision = Number(form.get("revision"));
  const profile = await validateCompanyWrite(
    workspaceId,
    input,
    prefix,
    id,
    revision,
  );
  const file = form.get("logo");
  let uploaded: string | undefined;
  try {
    if (file instanceof File && file.size) {
      requireValue(
        file.size <= 2000000 && ["image/png", "image/jpeg"].includes(file.type),
        "Logo : PNG ou JPEG, 2 Mo maximum.",
      );
      const bytes = await sharp(Buffer.from(await file.arrayBuffer()), {
        limitInputPixels: 16000000,
      })
        .resize({
          width: 400,
          height: 200,
          fit: "inside",
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();
      const blob = await storage.upload(
        `billing/${workspaceId}/logos/${crypto.randomUUID()}.png`,
        bytes,
      );
      requireValue(blob.url, "Stockage logo indisponible.");
      uploaded = blob.url;
      profile.logoBlobUrl = blob.url;
      profile.logo = `data:image/png;base64,${bytes.toString("base64")}`;
    }
    return await saveCompany(workspaceId, profile, prefix, id, revision);
  } catch (error) {
    if (uploaded) {
      try {
        await storage.remove(uploaded);
      } catch {
        console.error(
          "Billing logo cleanup failed after an unsuccessful company save.",
        );
      }
    }
    throw error;
  }
}
