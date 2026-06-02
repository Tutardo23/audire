import { type NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { obtenerMaterialPorIdDB } from "../../../actions-materiales";

export const runtime = "nodejs";

const safeInlineFileName = (value: string) =>
  String(value || "material.pdf")
    .replace(/[\r\n"]/g, "")
    .slice(0, 140);

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ ok: false, error: "Falta id del material." }, { status: 400 });
    }

    // Esta acción valida sesión y permisos por rol/colegio/polo antes de revelar el pathname.
    const material = await obtenerMaterialPorIdDB(id);

    if (!material?.pathname) {
      return NextResponse.json({ ok: false, error: "Material no encontrado." }, { status: 404 });
    }

    const result = await get(material.pathname, {
      access: "private",
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
    });

    if (!result) {
      return NextResponse.json({ ok: false, error: "Archivo no encontrado en Blob." }, { status: 404 });
    }

    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          "Cache-Control": "private, no-cache",
        },
      });
    }

    if (result.statusCode !== 200 || !result.stream) {
      return NextResponse.json({ ok: false, error: "Archivo no encontrado en Blob." }, { status: 404 });
    }

    const contentType = result.blob.contentType || material.contentType || "application/octet-stream";
    const filename = safeInlineFileName(material.filename || material.titulo || "material.pdf");

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-cache",
        "X-Content-Type-Options": "nosniff",
        ETag: result.blob.etag,
      },
    });
  } catch (error) {
    console.error("Error al leer material privado:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "No se pudo abrir el material.",
      },
      { status: 500 },
    );
  }
}
