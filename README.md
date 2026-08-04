# 綜合企業管理系統 (ERP/CRM)

本項目是一個基於 Next.js 開發的現代化綜合企業管理系統（ERP/CRM），旨在實現企業的**業財一體化**、**數據互通**、**權限嚴控**與**流程自動化**。

## 🌟 核心功能模塊

系統涵蓋了企業日常運營的完整生命週期：

- **基礎與權限管理 (RBAC)**：靈活的公司資料配置與細粒度的角色權限控制。
- **產品與庫存管理**：支持動態多屬性的產品檔案，以及防超賣、帶成本核算的實時庫存流轉。
- **客戶與銷售管理**：實現從客戶跟進、報價(見積)、合同簽訂到預收發票的“線索到現金”完整業務閉環。
- **財務與會計管理**：規範資金流出入，支持請款審批、預收款對接、應收應付(AR/AP)及自動生成總賬與財務報表(P&L)。
- **文件與網盤系統**：內置企業級個人網盤與公共知識庫，支持業務單據（PDF/Excel）的一鍵導出。
- **數據報表與分析**：提供多維度的財務、銷售、客戶及庫存數據可視化看板，輔助管理層決策。

## 🛠 技術棧選型

- **前端/全棧框架**：Next.js 14+ (App Router) + TypeScript
- **UI 組件**：Tailwind CSS + Shadcn UI
- **數據庫**：PostgreSQL (利用 JSONB 實現動態屬性) + Prisma / Drizzle ORM
- **狀態與認證**：Zustand + React Query + NextAuth.js (v5)
- **文件存儲**：AWS S3 / Aliyun OSS / MinIO

## 📚 詳細文檔

更多系統設計與開發細節，請參閱 `docs` 目錄下的相關文檔：

- [業務邏輯文檔 (Business Logic)](./docs/business_logic.md) - 核心業務流程、工作流與權限審批
- [技術規格書 (Tech Spec)](./docs/tech.md) - 架構設計、數據庫 Schema 與 API 規範
- [開發階段拆解 (Development Phase)](./docs/development_phase.md) - 項目開發計劃與任務拆解

## 🚀 快速開始

- **登錄賬號 (Email)**: `admin@tvp.local`
- **登錄密碼 (Password)**: `admin123`
