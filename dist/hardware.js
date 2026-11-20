export const HARDWARE_NOTICE = "Temsili RED Kit modeli — sanal uçlar fiziksel bağlantı talimatı değildir.";

export const hardware = {
  board: {
    id: "red-board",
    name: "RED Kit uyumlu kontrol kartı",
    status: "Doğrulanacak",
    description: "Arduino uyumlu olduğu ürün kaynaklarında belirtilen temsili kontrol katmanı.",
    pins: ["D2", "D3", "D5", "D6", "D9", "A0", "A1", "A2", "5V", "GND"]
  },
  components: [
    { id: "led", name: "Durum LED'i", status: "Kit açıklamasında belirtiliyor", purpose: "Dijital çıkışı görünür ışığa dönüştürür.", nature: "Araştırma istasyonu durum ve patika uyarısı.", pins: ["LED+", "LED-"] },
    { id: "light", name: "Işık sensörü", status: "Modeli doğrulanacak", purpose: "Ortam aydınlığındaki göreli değişimi okur.", nature: "Gölge ve gün ışığı gözlemi.", pins: ["L-SIG", "L-VCC", "L-GND"] },
    { id: "temp", name: "Sıcaklık sensörü", status: "Modeli doğrulanacak", purpose: "Eğitim simülasyonunda sıcaklık girdisi sağlar.", nature: "Fidanlık mikroiklim gözlemi.", pins: ["T-SIG", "T-VCC", "T-GND"] },
    { id: "distance", name: "Mesafe sensörü", status: "Modeli doğrulanacak", purpose: "Bir nesneye olan temsili mesafeyi ölçer.", nature: "Geçiş ve depo seviyesi modeli.", pins: ["TRIG", "ECHO", "D-VCC", "D-GND"] },
    { id: "driver", name: "Motor sürücü", status: "Kit açıklamasında belirtiliyor", purpose: "Motoru kontrol sinyalinden güvenli biçimde sürmeyi temsil eder.", nature: "Sera havalandırma prototipi.", pins: ["M-IN", "M-VCC", "M-GND", "M-OUT"] },
    { id: "motor", name: "Uyumlu motor", status: "Doğrulanacak — ek donanım gerekebilir", purpose: "Sanal fanı döndürür; doğrudan mikrodenetleyici pinine bağlanmaz.", nature: "Havalandırma aktüatörü.", pins: ["M+", "M-"] }
  ]
};

export const allPins = [
  ...hardware.board.pins,
  ...hardware.components.flatMap((item) => item.pins)
];
