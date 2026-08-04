import { prisma } from "@/lib/prisma";
import { getDefaultCompanyId } from "@/lib/company";
import { STAFF_ENGLISH_NAMES } from "@/lib/staff-display-names";

const APPROVAL_LOG_OPERATORS = STAFF_ENGLISH_NAMES;

function randomApprovalOperator() {
  const i = Math.floor(Math.random() * APPROVAL_LOG_OPERATORS.length);
  return APPROVAL_LOG_OPERATORS[i];
}

export default async function ApprovalPermissionsPage() {
  const companyId = await getDefaultCompanyId();

  // Mock data for approval logs（操作人從指定名單隨機）
  const approvalLogs = [
    { id: 1, doc: "EXP-202603-045", user: randomApprovalOperator(), action: "准予報銷", time: "2026-03-24 10:30:15", comment: "同意" },
    { id: 2, doc: "EXP-202603-042", user: randomApprovalOperator(), action: "退回修改", time: "2026-03-24 09:15:22", comment: "發票抬頭錯誤，請重新上傳" },
    { id: 3, doc: "EXP-202603-040", user: randomApprovalOperator(), action: "駁回", time: "2026-03-23 16:45:10", comment: "超出預算，暫不批准" },
    { id: 4, doc: "EXP-202603-038", user: randomApprovalOperator(), action: "准予報銷", time: "2026-03-23 14:20:05", comment: "核對無誤" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">審批權限設置 (Approval Workflow)</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          設置財務單據的審批流程與條件，保障資金安全。
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="text-sm font-semibold mb-4">條件設置 (金額區間)</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex-1">
                <div className="text-sm font-medium">一級審批</div>
                <div className="text-xs text-zinc-500">$0 - $1,000</div>
              </div>
              <select className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900">
                <option>部門組長</option>
                <option>部門經理</option>
              </select>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex-1">
                <div className="text-sm font-medium">二級審批</div>
                <div className="text-xs text-zinc-500">$1,000 - $5,000</div>
              </div>
              <select className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900" defaultValue="財務經理">
                <option>部門經理</option>
                <option value="財務經理">財務經理</option>
              </select>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex-1">
                <div className="text-sm font-medium">三級審批</div>
                <div className="text-xs text-zinc-500">&gt; $5,000</div>
              </div>
              <select className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900" defaultValue="CEO">
                <option>財務總監</option>
                <option value="CEO">CEO</option>
              </select>
            </div>
            <button className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
              保存審批條件
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="text-sm font-semibold mb-4">流程預覽</h3>
          <div className="flex flex-col items-center justify-center h-full py-4">
            <div className="flex items-center w-full max-w-sm">
              <div className="flex-1 flex flex-col items-center">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-medium dark:bg-blue-900/30 dark:text-blue-400">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <span className="text-xs mt-2 font-medium">申請人</span>
              </div>
              <div className="flex-1 h-px bg-zinc-300 dark:bg-zinc-700"></div>
              <div className="flex-1 flex flex-col items-center">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center font-medium dark:bg-amber-900/30 dark:text-amber-400">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-xs mt-2 font-medium">財務審核</span>
              </div>
              <div className="flex-1 h-px bg-zinc-300 dark:bg-zinc-700"></div>
              <div className="flex-1 flex flex-col items-center">
                <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-medium dark:bg-purple-900/30 dark:text-purple-400">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="text-xs mt-2 font-medium">CEO審批</span>
              </div>
              <div className="flex-1 h-px bg-zinc-300 dark:bg-zinc-700"></div>
              <div className="flex-1 flex flex-col items-center">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-medium dark:bg-emerald-900/30 dark:text-emerald-400">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-xs mt-2 font-medium">出納付款</span>
              </div>
            </div>
            
            <div className="mt-8 p-4 bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 w-full">
              <div className="text-sm font-medium mb-2">審批人操作說明：</div>
              <div className="flex gap-2">
                <button className="flex-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-400">
                  准予報銷
                </button>
                <button className="flex-1 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400">
                  退回修改
                </button>
                <button className="flex-1 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
                  駁回 (需理由)
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-950">
          <h3 className="text-sm font-semibold">審批日誌記錄</h3>
        </div>
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3">時間</th>
              <th className="px-4 py-3">操作人</th>
              <th className="px-4 py-3">關聯單據</th>
              <th className="px-4 py-3">操作動作</th>
              <th className="px-4 py-3">審批意見</th>
            </tr>
          </thead>
          <tbody>
            {approvalLogs.map((log) => (
              <tr key={log.id} className="border-b border-zinc-100 dark:border-zinc-800">
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{log.time}</td>
                <td className="px-4 py-2 font-medium">{log.user}</td>
                <td className="px-4 py-2 text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">{log.doc}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    log.action === '准予報銷' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                    log.action === '退回修改' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    {log.action}
                  </span>
                </td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{log.comment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
