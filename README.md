# MediTrack — .NET Edition
## Converted from Firebase + Vanilla JS → ASP.NET Core 8 + EF Core + SQLite

---

## What Changed (Firebase → .NET)

| Firebase (Original)                        | .NET Replacement                        |
|--------------------------------------------|-----------------------------------------|
| Firebase Auth SDK                          | ASP.NET Core Identity + Cookie Auth     |
| `firebase.auth().signInWithEmailAndPassword()` | `POST /api/auth/login`              |
| `firebase.auth().createUserWithEmailAndPassword()` | `POST /api/auth/register`       |
| `firebase.auth().signOut()`                | `POST /api/auth/logout`                 |
| `auth.onAuthStateChanged()`                | `GET /api/auth/me`                      |
| Firestore `users/{uid}/medicines`          | EF Core `Medicines` table (SQLite)      |
| Firestore `users/{uid}/profile/info`       | EF Core `UserProfiles` table (SQLite)   |
| Firebase Console project setup             | ❌ Not needed                           |
| Firebase API keys in JS                    | ❌ Removed completely                   |

---

## Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- Any IDE: Visual Studio 2022, VS Code, or Rider

---

## Quick Start (5 steps)

### 1. Restore NuGet packages
```bash
cd MediTrack
dotnet restore
```

### 2. Apply database migrations
```bash
dotnet ef migrations add InitialCreate
dotnet ef database update
```
> This creates `meditrack.db` (SQLite) automatically.  
> **No database server needed** — SQLite is a single file.

### 3. Run the app
```bash
dotnet run
```

### 4. Open in browser
```
https://localhost:5001
```

### 5. Register & use
- Click **Register** → create your account
- Fill in your pharmacy profile
- Start adding medicines!

---

## Project Structure

```
MediTrack/
├── Controllers/
│   ├── AuthController.cs        ← Login / Register / Logout / Me
│   ├── MedicinesController.cs   ← CRUD for medicines
│   ├── ProfileController.cs     ← Pharmacy profile
│   └── HomeController.cs        ← Serves the SPA shell
├── Data/
│   └── ApplicationDbContext.cs  ← EF Core DbContext
├── Models/
│   ├── ApplicationUser.cs       ← Extends IdentityUser
│   ├── Medicine.cs              ← Medicine entity
│   └── UserProfile.cs          ← Pharmacy profile entity
├── Views/
│   └── Home/Index.cshtml        ← Main app HTML (Razor)
├── wwwroot/
│   ├── css/style.css            ← Original CSS (unchanged)
│   └── js/script.js             ← Updated JS (Firebase removed)
├── Program.cs                   ← App startup
├── appsettings.json             ← DB connection string
└── MediTrack.csproj             ← NuGet packages
```

---

## Switching to SQL Server (Production)

1. Install the SQL Server package:
   ```bash
   dotnet add package Microsoft.EntityFrameworkCore.SqlServer
   ```

2. Update `appsettings.json`:
   ```json
   "ConnectionStrings": {
     "DefaultConnection": "Server=YOUR_SERVER;Database=MediTrack;Trusted_Connection=True;"
   }
   ```

3. In `Program.cs`, change `UseSqlite` → `UseSqlServer`.

4. Run migrations again:
   ```bash
   dotnet ef migrations add SqlServerMigration
   dotnet ef database update
   ```

---

## API Endpoints Summary

| Method | Endpoint              | Description                     |
|--------|-----------------------|---------------------------------|
| GET    | /api/auth/me          | Check if logged in              |
| POST   | /api/auth/login       | Sign in                         |
| POST   | /api/auth/register    | Create account                  |
| POST   | /api/auth/logout      | Sign out                        |
| GET    | /api/medicines        | Get all medicines (current user)|
| POST   | /api/medicines        | Add a medicine                  |
| PUT    | /api/medicines/{id}   | Update a medicine               |
| DELETE | /api/medicines/{id}   | Delete a medicine               |
| GET    | /api/profile          | Get profile                     |
| POST   | /api/profile          | Create profile (first time)     |
| PUT    | /api/profile          | Update profile                  |

---

## Features Preserved

- ✅ Login / Register with password strength meter
- ✅ Pharmacy profile setup
- ✅ Add medicine with image (base64)
- ✅ Edit / Delete medicine with confirmation modal
- ✅ Expiry status badges (30d / 60d / 90d / Expired)
- ✅ Low stock alerts (qty < 10)
- ✅ Search, filter by category, supplier, status
- ✅ Sort by name, expiry, quantity
- ✅ Analytics charts (Chart.js)
- ✅ AI Medicine Lookup (OpenFDA API)
- ✅ Export PDF, Excel, CSV
- ✅ Invoice print
- ✅ Dark mode
- ✅ Browser notifications
- ✅ All animations preserved
