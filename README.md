# E-Football League Management System

## 🆕 Fitur Baru: Tim Saya & Login System

### 📋 Deskripsi
Sistem manajemen liga E-Football dengan fitur login dan dashboard "Tim Saya" dimana setiap user memiliki tim sendiri.

### 🔑 Akses Login

#### Akun Demo:
- **Admin**: `admin` / `admin123` 
- **User**: `user` / `user123`

#### Registrasi User Baru:
- Buka [login.html](login.html)
- Pilih tab "Daftar"
- Isi username, password, dan nama tim
- Tim akan otomatis dibuat untuk user tersebut

### 🏠 Dashboard & Navigasi

#### 1. **Login Page** ([login.html](login.html))
- Form login/registrasi
- Validasi kredensial
- Redirect otomatis berdasarkan role

#### 2. **Admin Dashboard** ([index.html](index.html))
- Akses: Admin saja
- Fitur: Manajemen tim, jadwal, approval hasil
- Navigasi: Untuk mengakses, klik "Lihat Liga" lalu pilih tab "Admin" (setelah login langsung ke "Tim Saya")

#### 3. **User Dashboard** ([public.html](public.html))  
- Akses: Admin dan User
- Fitur: Lihat klasemen, jadwal, input hasil
- Navigasi: Admin Panel (admin only), Tim Saya, Logout

#### 4. **Tim Saya Dashboard** ([my-team.html](my-team.html))
- Akses: Semua user yang login
- Fitur:
  - Overview statistik tim
  - Pertandingan tim (selesai & jadwal)
  - Klasemen liga dengan highlight tim user
  - Pengaturan nama tim

### 🎮 Cara Menggunakan

1. **Mulai Server**:
   ```bash
   # Double-click file ini:
   start-database-server.bat
   ```

2. **Akses System**:
   - Buka browser ke `http://localhost:8000`
   - Akan redirect ke halaman login
   - Login dengan akun demo atau daftar akun baru

3. **Sebagai Admin**:
   - Login dengan `admin/admin123`
   - Langsung diarahkan ke dashboard "Tim Saya"
   - Untuk mengakses Admin Panel, klik "Lihat Liga" lalu pilih tab "Admin"

4. **Sebagai User**:
   - Login dengan `user/user123` atau akun yang didaftar
   - Lihat dan input hasil pertandingan
   - Kelola tim sendiri di dashboard "Tim Saya"

### 🏆 Fitur Tim Saya

- **Overview**: Statistik lengkap tim (main, menang, seri, kalah, gol)
- **Pertandingan**: History dan jadwal pertandingan tim
- **Klasemen**: Posisi tim di liga dengan highlight
- **Settings**: Ubah nama tim

### 🔒 Sistem Keamanan

- Autentikasi wajib untuk akses
- Role-based access control
- Password tersimpan aman di database
- Session management

### 💾 Penyimpanan Data

- **Database**: JSON files via Node.js API
- **Fallback**: localStorage untuk offline mode
- **Sinkronisasi**: Real-time antar multiple users

### 🌐 Network Sharing

Server berjalan di port 8000 dan dapat diakses oleh pengguna lain di jaringan WiFi yang sama menggunakan IP address komputer host.

---

**Selamat menggunakan sistem manajemen liga E-Football! ⚽**