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

## Donanım kapsamı

Model gerçek ürünün birebir dijital ikizi değildir. Sensör modelleri, kart yerleşimi, pin eşlemeleri, besleme değerleri ve motor özellikleri doğrulanana kadar merkezi `dist/hardware.js` dosyasında **Doğrulanacak** olarak tutulur. Sanal uçlar fiziksel bağlantı talimatı değildir.
