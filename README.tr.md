# JARVIS 2.0 — AI Desktop Voice & Vision Assistant

<p align="center">
  <a href="README.md"><b>English</b></a> | <a href="README.tr.md"><b>Türkçe</b></a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/berkaysahin-dev/Shaz-Jarvis-AI/main/docs/preview.jpg" alt="JARVIS 2.0 Desktop Interface" width="100%" style="border-radius: 14px; box-shadow: 0 12px 36px rgba(0,0,0,0.6);" />
</p>

<p align="center">
  <b>Yapay Zeka Masaüstü Asistanı — Ses, Görsel Analiz ve Sistem Kontrolü</b><br/>
  Powered by <a href="https://shazagency.com">Shaz Agency</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-43.8-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Three.js-0.185-000000?style=for-the-badge&logo=three.js&logoColor=white" alt="Three.js" />
  <img src="https://img.shields.io/badge/Google_Gemini-Flash-8E75B2?style=for-the-badge&logo=google&logoColor=white" alt="Google Gemini" />
  <img src="https://img.shields.io/badge/Edge_Neural_TTS-tr--TR--Ahmet-0078D7?style=for-the-badge&logo=microsoft&logoColor=white" alt="Edge Neural TTS" />
</p>

---

## Özellikler

### 1. 3D Ses Duyarlı Küre
- **Galaksi ve Klasik Mod:** Yıldız alanı ve sarmal kollarıyla yeni galaksi küresi veya klasik parçacık küresi — Ayarlar'dan değiştirilebilir.
- **Canlı Ses Senkronizasyonu:** Web Audio Analyser API ile mikrofon girişi ve konuşma çıkışına göre gerçek zamanlı tepki verir.

### 2. Ses Çıkışı (Gemini HD + Neural Yedek)
- **Gemini HD Sesler:** Gemini metin-okuma sesleriyle (`Charon`, `Orus`, `Kore` vb.) doğal Türkçe ve İngilizce seslendirme.
- **Otomatik Yedek:** Kota dolduğunda veya HD ses kullanılamadığında Microsoft Edge nöral seslerine (96 kbps, ton/hız ayarlı) veya sistem sesine geçer.
- **Ses Önizleme:** Ayarlar'dan motoru ve sesi seçip kaydetmeden önce dinleyebilirsiniz.

### 3. Sesli Giriş ve Model Seçimi
- **Doğrudan Mikrofon Kaydı:** Yankı ve gürültü engelleme ile kayıt alır, konuşmanın bittiğini otomatik algılar.
- **Yazıya Dökme ve Oturum Hafızası:** Konuşmalar Gemini ile yazıya çevrilip sohbette gösterilir; uygulama kapanana kadar oturum hafızası korunur.
- **Otomatik Model Seçimi:** API anahtarınızın erişebildiği güncel Flash modellerini otomatik tespit eder; geçersiz anahtar, kota, mikrofon ve bağlantı hatalarını ayrı bildirir.

### 4. Anında Durdurma ve Araya Girme
- Konuşurken veya dinlerken *"dur"*, *"sus"*, *"jarvis dur"*, *"sohbeti durdur"*, *"iptal"* diyerek, `Escape` tuşuna basarak veya **[DURDUR]** butonuna tıklayarak işlemi anında kesebilirsiniz.

### 5. Sistem İzleme ve Masaüstü Kontrolü
- **CPU ve RAM Halka Göstergeleri:** Kenar çubuğunda canlı CPU yükü ve bellek kullanımı.
- **Araç Çağırma:** Uygulama ve klasör açma, Google / YouTube / Haritalar araması, medya ve ses kontrolü, not ve hatırlatıcı yönetimi, dosya arama, ekran ve kamera analizi, bilgisayarı kilitleme.
- **Özel Sesli Komutlar:** Ayarlar'dan cümlelere özel yanıt ve eylem tanımlama (`"Hey Jarvis"` varsayılan komutuyla birlikte gelir).

### 6. Mini Menü, Tepsi Modu ve Uyandırma Kelimesi
- **Masaüstü Mini Menü:** Durum, saat, ekran analizi, mikrofon ve konuş tuşlarını içeren, sürüklenebilir her zaman üstte kapsül.
- **"Hey Jarvis" ile Uyandırma:** Pencere kapatıldığında JARVIS sistem tepsisinde çalışmaya devam eder ve `"Hey Jarvis"` dediğinizde açılır.
- **Windows ile Başlatma:** Oturum açılışında arka planda başlatma (Ayarlar veya tepsi menüsünden yönetilebilir).
- **Mobil Uzaktan Erişim (LAN):** Aynı Wi-Fi ağındaki telefondan QR kod ile bağlanıp durum takibi ve komut gönderimi.

---

## Teknoloji Yığını

| Bileşen | Teknoloji |
| :--- | :--- |
| **Masaüstü Çatısı** | Electron 43 (Windows) |
| **Arayüz** | React 19 (TypeScript) + Vite 8 |
| **3D Grafik** | Three.js + React Three Fiber + Drei |
| **Yapay Zeka** | Google Gemini REST API |
| **Ses Sentezi** | Gemini TTS (HD) + Microsoft Edge Neural TTS yedek |
| **Yazı Tipi** | Inter |

---

## İndir (Windows)

Güncel sürümü **[Releases](https://github.com/berkaysahin-dev/Shaz-Jarvis-AI/releases/latest)** sayfasından indirebilirsiniz:

- **`JARVIS.Setup.x.y.z.exe`**: Başlat menüsü ve masaüstü kısayolu ile kurulum.
- **`JARVIS.x.y.z.exe`**: Taşınabilir sürüm, kurulum gerektirmez.

İlk açılışta Ayarlar'dan kendi ücretsiz [Google Gemini API anahtarınızı](https://aistudio.google.com/apikey) girin. Anahtar yalnızca bilgisayarınızda saklanır.  
Uygulama henüz dijital olarak imzalı olmadığı için Windows SmartScreen uyarısı çıkarsa **Ek bilgi › Yine de çalıştır** seçeneğini kullanın.

## Geliştirici Kurulumu

### Gereksinimler
- **Node.js** 18+
- [Google AI Studio](https://aistudio.google.com/) üzerinden alınmış **Google Gemini API Key**

### Yerelde Çalıştırma

1. Depoyu klonlayın:
   ```bash
   git clone https://github.com/berkaysahin-dev/Shaz-Jarvis-AI.git
   cd Shaz-Jarvis-AI
   ```

2. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```

3. Uygulamayı başlatın:
   ```bash
   BASLAT.bat
   ```
   veya geliştirici modunda:
   ```bash
   npm run electron:dev
   ```

### Mobil Uzaktan Erişim (LAN)
1. `TELEFON.bat` dosyasını (veya `npm run dev -- --host` komutunu) çalıştırın.
2. Telefonunuzdan ekrandaki yerel IP adresini açın ya da kenar çubuğundaki QR kodu okutun.

---

## Yapılandırma

1. JARVIS'i açın.
2. Kenar çubuğundan **Ayarlar** bölümüne girin.
3. **Google Gemini API Anahtarınızı** yapıştırıp kaydedin.

---

## Geliştirici

**[Shaz Agency](https://shazagency.com)**  
Depo: [github.com/berkaysahin-dev/Shaz-Jarvis-AI](https://github.com/berkaysahin-dev/Shaz-Jarvis-AI)

## Lisans

Bu proje [MIT Lisansı](LICENSE) ile lisanslanmıştır.
