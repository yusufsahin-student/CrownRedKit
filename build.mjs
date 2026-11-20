import { cp, mkdir, rm, stat } from "node:fs/promises";

// Önce ürün davranışlarını ve statik dosyaları doğrula.
await import("./verify.mjs");

const source = new URL("./dist/", import.meta.url);
const output = new URL("./public/", import.meta.url);

const sourceInfo = await stat(source);
if (!sourceInfo.isDirectory()) {
  throw new Error("dist klasörü bulunamadı; statik üretim yapılamadı.");
}

// public yalnızca build çıktısıdır; her üretimde temiz bir kopya oluşturulur.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });

console.log("✓ Vercel statik çıktısı hazır: public/");
