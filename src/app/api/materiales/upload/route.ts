import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth, clerkClient } from "@clerk/nextjs/server";

export const runtime = "nodejs";

function safeFileName(name: string) {
  return String(name || "material.pdf")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

async function getUserRole(userId: string) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  const role =
    user.publicMetadata?.role ||
    user.privateMetadata?.role ||
    user.unsafeMetadata?.role ||
    "";

  return String(role).toLowerCase().trim();
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
    }

    const role = await getUserRole(userId);

    if (role !== "admin") {
      return NextResponse.json({ ok: false, error: "Solo admin puede subir materiales." }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "No se recibió ningún archivo." }, { status: 400 });
    }

    if (file.size <= 0) {
      return NextResponse.json({ ok: false, error: "El archivo está vacío." }, { status: 400 });
    }

    const maxSizeMb = 20;
    const maxSizeBytes = maxSizeMb * 1024 * 1024;

    if (file.size > maxSizeBytes) {
      return NextResponse.json({ ok: false, error: `El archivo supera el máximo de ${maxSizeMb}MB.` }, { status: 400 });
    }

    const fileName = safeFileName(file.name);
    const isPdf = file.type === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      return NextResponse.json({ ok: false, error: "Solo se permiten archivos PDF." }, { status: 400 });
    }

    const pathname = `materiales/${userId}/${Date.now()}-${fileName}`;

    const blob = await put(pathname, file, {
      access: "private",
      addRandomSuffix: false,
      contentType: "application/pdf",
    });

    return NextResponse.json({
      ok: true,
      url: blob.url,
      pathname: blob.pathname,
      sizeBytes: file.size,
      contentType: "application/pdf",
      filename: fileName,
    });
  } catch (error) {
    console.error("Error al subir material:", error);
    const message = error instanceof Error ? error.message : "No se pudo subir el material.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
