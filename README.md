# Canopy BioCore — RED Kit Doğa Laboratuvarı

Türkçe, tarayıcı tabanlı etkileşimli robotik öğrenme platformu. Uygulama; 10 veri odaklı görev, temsili WebGL RED Kit modeli, erişilebilir 2D alternatif, doğrulanan sanal bağlantılar, güvenli ve sınırlı kod yorumlayıcısı, ortam kontrolleri, seri monitör, grafikler, otomatik testler ve yerel ilerleme kaydı içerir.

## Çalıştırma

Node.js 18 veya üstü yeterlidir; harici paket kurulumu gerekmez.

```powershell
npm start
```

Ardından `http://127.0.0.1:4173` adresini açın.

## Doğrulama

```powershell
npm run verify
```

## Vercel'e yayınlama

Proje, Vercel üzerinde **Other** framework türüyle doğrudan yayınlanabilir. Gerekli ayarlar `vercel.json` içinde sürüm kontrolüne alınmıştır:

- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: varsayılan ayar

GitHub repository'sini Vercel'e bağladıktan sonra ek bir ortam değişkeni gerekmez. Her `main` branch güncellemesi yeni bir üretim dağıtımı başlatır.

Vercel CLI kullanılıyorsa:

```powershell
npx vercel
```

Üretim dağıtımı için:

```powershell
npx vercel --prod
```

## Donanım kapsamı

Model gerçek ürünün birebir dijital ikizi değildir. Sensör modelleri, kart yerleşimi, pin eşlemeleri, besleme değerleri ve motor özellikleri doğrulanana kadar merkezi `dist/hardware.js` dosyasında **Doğrulanacak** olarak tutulur. Sanal uçlar fiziksel bağlantı talimatı değildir.
