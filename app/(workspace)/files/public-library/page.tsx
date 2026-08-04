import PublicLibraryClient from "./public-library-client";
import { getPublicLibraryPagePayload, listPersonalDriveCategoryOptions } from "@/lib/server/files";
import { getSession } from "@/lib/auth/session";
import { canManageFiles } from "@/lib/rbac/files-access";
import { getDefaultCompanyId } from "@/lib/company";

export default async function PublicLibraryPage() {
  const payload = await getPublicLibraryPagePayload();
  const session = await getSession();

  if (!payload.ok) {
    const errorMessage =
      payload.reason === "not_logged_in"
        ? "請先登入後再訪問公共文件庫。"
        : payload.reason === "no_permission"
          ? "目前登入令牌中沒有文件庫讀取權限（需 read:files、manage:files、read:all 或 manage:all）。若您已具備管理員權限，請嘗試退出後重新登入以刷新權限；或由管理員在「角色權限」中為該角色勾選上述權限。"
          : (payload.detail ??
            "無法解析默認公司：請確認資料庫中已建立公司主檔，或執行 npm run db:seed 初始化資料。");

    return (
      <PublicLibraryClient
        initialFiles={[]}
        errorMessage={errorMessage}
        canManage={false}
        personalCategories={[]}
      />
    );
  }

  const initialFiles = payload.files;
  const canManage =
    session?.sub != null &&
    canManageFiles(session.isSuperAdmin === true, session.permissions ?? []);
  let personalCategories: Awaited<ReturnType<typeof listPersonalDriveCategoryOptions>> = [];
  if (canManage && session?.sub) {
    const companyId = await getDefaultCompanyId();
    if (companyId) {
      personalCategories = await listPersonalDriveCategoryOptions(companyId, session.sub);
    }
  }
  return (
    <PublicLibraryClient
      initialFiles={initialFiles}
      canManage={canManage}
      personalCategories={personalCategories}
    />
  );
}
