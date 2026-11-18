import { NavLink, PageTitle } from "@/components/ui";
import { logout } from "../actions";

export default function Menu() {
  return (
    <main>
      <PageTitle label="メニュー" title="メニュー" />
      <div className="card py-0">
        <NavLink href="/candidates">買付候補の一覧（買い候補・保留・見送り）</NavLink>
        <NavLink href="/profit">利益計算・買付判断</NavLink>
        <NavLink href="/market">世界の相場・売れやすさ</NavLink>
        <NavLink href="/compare">国・販売先の比較</NavLink>
        <NavLink href="/learn">学習（7日間の教材・クイズ）</NavLink>
        <NavLink href="/history">履歴（判定・購入・販売）</NavLink>
        <NavLink href="/products/new">＋ 商品を追加</NavLink>
        <NavLink href="/import">データ取込（CSVファイル）</NavLink>
        <NavLink href="/settings">設定（判断の基準・税・手数料・為替）</NavLink>
      </div>
      <form action={logout} className="mt-6"><button className="btn w-full">ログアウト</button></form>
    </main>
  );
}
