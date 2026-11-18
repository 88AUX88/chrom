import { NavLink, PageTitle } from "@/components/ui";
import { logout } from "../actions";

export default function Menu() {
  return (
    <main>
      <PageTitle label="メニュー" title="メニュー" />
      <div className="card py-0">
        <NavLink href="/candidates">CANDIDATES｜買付候補一覧（BUY/HOLD/PASS）</NavLink>
        <NavLink href="/profit">PROFIT｜利益計算・買付判定</NavLink>
        <NavLink href="/market">MARKET｜世界相場・需要・流動性</NavLink>
        <NavLink href="/compare">COMPARE｜国・販売先比較</NavLink>
        <NavLink href="/learn">LEARN｜7日間教材・クイズ</NavLink>
        <NavLink href="/history">HISTORY｜判定・購入・販売履歴</NavLink>
        <NavLink href="/products/new">＋ 商品を追加</NavLink>
        <NavLink href="/import">IMPORT｜CSVデータ取込</NavLink>
        <NavLink href="/settings">SETTINGS｜判定基準・税・手数料・為替</NavLink>
      </div>
      <form action={logout} className="mt-6"><button className="btn w-full">ログアウト</button></form>
    </main>
  );
}
