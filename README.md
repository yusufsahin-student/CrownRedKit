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
- Output Directory: `public`
- Install Command: varsayılan ayar

`npm run build`, doğrulanmış `dist` içeriğini temiz bir `public` klasörüne kopyalar. Kök dizinde Vercel Function olarak algılanabilecek bir sunucu giriş noktası bulunmaz; yerel geliştirme sunucusu `tools/local-server.mjs` altında tutulur.

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

### Fotoğraf referanslı 3B model

22 Kasım 2026 tarihli kullanıcı fotoğrafları esas alınarak eski geometri ve SVG stüdyosu kaldırıldı. Ana sayfa, laboratuvar ve Kiti Tanı aynı yeni WebGL geometrisini kullanır. Siyah şekilli tabla, kırmızı alt plaka, kırmızı 170 delikli breadboard, altı LED ve RGB LED, dört buton, anahtar, potansiyometre, kare SMD işlemcili UNO ve LCD yeniden çizildi. Ayrı aksesuar görünümünde ultrasonik sensör, mikro servo, PIR, RFID kartı ve kumanda bulunur. Ek olarak 9V pil, USB kablosu, RFID anahtarlığı ve kartı, küçük kırmızı modül çizildi. Küçük kırmızı modülün işlevi fotoğraftan kesinleştirilmedi. Paket, çanta ve yedek servo kolları sahneye dahil edilmedi.

Kiti Tanı bölümünde parça odağı, üst/çapraz kamera, yakınlaştırma, otomatik dönüş, klavyeyle dönüş, LED gösterimi, potansiyometre hareketi ve referans fotoğrafı vardır. LED ve pot gösterimleri görev durumunu değiştirmez.

Boyutlar fotoğraf oranlarından tahmin edilmiştir; CAD ölçüm doğruluğu veya görünmeyen alt devrenin eşleşmesi doğrulanmamıştır. Çalışma devresi hâlâ eğitim simülasyonudur. Sanal pin isimleri fiziksel kablolama yönergesi değildir; özellikle servo/fan ve sıcaklık algılayıcı eşleşmeleri fiziksel kit üzerinde doğrulanmadan donanım yüklemesi yapılamaz.

### Görev içi sensör kütüphanesi

Breadboard üzerindeki sabit jumper çizimleri kaldırıldı. Görevlerin altındaki kütüphane, mesafe/PIR/RFID/kızılötesi/kırmızı modül/LDR/sıcaklık-nem/servo için ayrı ekleme, kaldırma ve yakın 3B önizleme sunar. LDR ile sıcaklık-nem parçası kutu şemasından gelir; modül tipleri doğrulanmamıştır. Kırmızı modül yalnızca görsel olarak incelenir; işlevi tahmin edilmez.

Parça seçimi görev başına tarayıcıda saklanır. Mesafe sensörü ilgili görevlerde gerekli olduğundan kaldırılamaz. PIR hareketi, RFID kart yaklaşması, kızılötesi sinyal, servo açısı, ışık ve örnek sıcaklık için bağımsız eğitim gösterimleri bulunur. Bu ek gösterimler kod yorumlayıcısına veya başarı puanına yeni sensör desteği eklemez. Hareketi azalt tercihi animasyonları durdurur; sayısal sonuçlar kullanılabilir kalır.

### Malzeme ve etkileşim

Metal yüzeylerde sanal stüdyo ışığı yansımaları, plastik ve LED yüzeylerde ayrı parlaklık tepkileri bulunur. Yansımalar gerçek zamanlı ışın izleme değil, WebGL yüzey gölgelendirmesidir. Kart baskıları alfa harmanlama ve desteklenen cihazlarda anizotropik doku süzme kullanır. Fareyle bileşen üzerine gelince açıklama ve hafif ışık vurgusu görünür. Sürükleme sırasında ipucu kapanır. Escape ile kapatılabilir. Hareketi azalt seçeneği titreşen vurguyu durdurur.

Görsel ve teknik karşılaştırma kaynakları: [RED Kit üretici sayfası](https://red-kit.com/), [Arduino UNO R3 SMD](https://docs.arduino.cc/hardware/uno-rev3-smd/). Üretici çizimleri kitin fotoğraflarındaki klon kartın birebir devre şeması olarak kabul edilmez. Ana geometrinin yerleşim referansı kullanıcının fotoğraflarıdır.
