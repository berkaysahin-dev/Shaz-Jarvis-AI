# JARVIS 2.0 — AI Desktop Voice & Vision Assistant

<p align="center">
  <a href="README.md"><b>English</b></a> | <a href="README.tr.md"><b>Türkçe</b></a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/berkaysahin-dev/Shaz-Jarvis-AI/main/docs/preview.jpg" alt="JARVIS 2.0 Desktop Interface" width="100%" style="border-radius: 14px; box-shadow: 0 12px 36px rgba(0,0,0,0.6);" />
</p>

<p align="center">
  <b>Gelişmiş Yapay Zeka Masaüstü Asistanı — Ses, Görsel Zeka ve Sistem Kontrolü</b><br/>
  Powered by <a href="https://shazagency.com">Shaz Agency</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-43.4-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Three.js-0.185-000000?style=for-the-badge&logo=three.js&logoColor=white" alt="Three.js" />
  <img src="https://img.shields.io/badge/Google_Gemini-2.0_Flash-8E75B2?style=for-the-badge&logo=google&logoColor=white" alt="Google Gemini" />
  <img src="https://img.shields.io/badge/Edge_Neural_TTS-tr--TR--Ahmet-0078D7?style=for-the-badge&logo=microsoft&logoColor=white" alt="Edge Neural TTS" />
</p>
---

## Yeni Nesil Özellikler (JARVIS 2.0)

### 1. 3D Motion Exploration Görselleştiricisi
- **Çok Eksenli Jiroskopik FUI Halkaları:** X, Y, Z uzayında bağımsız dönen neon halkalar ve yörüngesinde süzülen parlayan foton boncukları.
- **360° Dairesel Ses Ekolayzerı:** Ses giriş ve çıkışına göre dinamik uzayıp kısalan 64 adet 3D radyal spektrum çubuğu.
- **1200+ Kuantum Parçacık Sarmalı:** Organik sıvı plazma çekirdek etrafında dönen parçacık bulutu.

### 2. Stüdyo Kalitesinde Doğal İnsan Sesi (Neural TTS)
- **Doğal Türkçe Tonlama:** Standart robotik sesler yerine insansı tonlamalara, nefes aralıklarına sahip **Neural Türkçe Asistan Sesi** (`tr-TR-AhmetNeural`).
- **Canlı 3D Küre Senkronizasyonu:** Çalınan ses Web Audio Analyser ile 3D küreye bağlanır; JARVIS konuşurken küre ritmik olarak dalgalanır.

### 3. Ultra Düşük Gecikmeli Ses Algılama (Sub-300ms)
- **Canlı Akışlı STT:** Konuştuğunuz kelimeler ağzınızdan çıktığı an algılanır.
- **Hızlı VAD (Ses Aktivite Dedektörü):** Cümleniz bittikten yalnızca **380 milisaniye** sonra komut Gemini'ye iletilir.
- **Düşünme Gecikmesiz Yanıt:** `gemini-2.0-flash` motoru sayesinde anında tek ve net cümlelik Türkçe yanıt üretilir.

### ⏹ 4. Anında Sesli Sohbeti Durdurma & Araya Girme (Interrupt)
- Konuşurken veya dinlerken *"dur"*, *"sus"*, *"jarvis dur"*, *"sohbeti durdur"*, *"iptal"* dediğinizde veya klavyeden `Escape` tuşuna / arayüzdeki **[DURDUR]** butonuna bastığınızda ses ve işlem anında kesilir.

### 5. Gerçek Zamanlı OS Sparkline Performans Grafikleri
- Son 15 saniyelik CPU ve RAM kullanımını degrade dalga grafikleri (Sparkline) ile canlı çizen modern OS kartı.

### 6. Modern Tipografi
- **Arayüz Fontu:** `Plus Jakarta Sans`
- **Teknik/Telemetri Fontu:** `JetBrains Mono`

### 7. Akıllı Uygulama Kontrolü & Mobil Uzaktan Erişim
- Chrome, Spotify, VS Code, Not Defteri, Hesap Makinesi gibi uygulamaları sesle veya modern listeden başlatma.
- Sol kenarda aktif uygulamayı gösteren parlayan **Cyan Aktif Göstergesi**.
- QR Kod ile cep telefonundan bağlanıp komut gönderebilme.

---

## Mimari & Teknoloji Yığını

| Bileşen | Teknoloji |
| :--- | :--- |
| **Masaüstü Motoru** | Electron 43 (Windows Native) |
| **Önyüz UI** | React 19 (TypeScript) + Vite 8 |
| **3D Rendering** | Three.js + React Three Fiber + Drei |
| **Yapay Zeka Modelleri** | Google Gemini REST (`gemini-2.0-flash`, `gemini-2.5-flash`) |
| **Ses Sentezi** | Microsoft Edge Neural TTS (`tr-TR-AhmetNeural`) |
| **Tipografi** | Plus Jakarta Sans & JetBrains Mono |

---

## Hızlı Başlangıç & Kurulum

### Gereksinimler
- **Node.js**: v18.0.0 veya üzeri
- **Google Gemini API Key**: [Google AI Studio](https://aistudio.google.com/)'dan ücretsiz temin edebilirsiniz.

### Kurulum Adımları

1. **Depoyu Klonlayın:**
   ```bash
   git clone https://github.com/berkaysahin-dev/Shaz-Jarvis-AI.git
   cd Shaz-Jarvis-AI
   ```

2. **Bağımlılıkları Yükleyin:**
   ```bash
   npm install
   ```

3. **Uygulamayı Başlatın:**
   ```bash
   BASLAT.bat
   ```
   veya geliştirici modunda:
   ```bash
   npm run electron:dev
   ```

---

## Yapılandırma
1. JARVIS'i açın.
2. Sağ üstteki **Ayarlar (Dişli)** ikonuna tıklayın.
3. **Google Gemini API Anahtarınızı** girip kaydedin.

---

## Marka & Geliştirici

Geliştirici & Tasarım: **[Shaz Agency](https://shazagency.com)**  
Depo: [github.com/berkaysahin-dev/Shaz-Jarvis-AI](https://github.com/berkaysahin-dev/Shaz-Jarvis-AI)

---

## Lisans
Bu proje [MIT Lisansı](LICENSE) altında lisanslanmıştır.
