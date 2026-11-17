// ルート直下には置かない: Next.js 15.5 でサーバーアクションの同一ページ redirect が反映されなくなるため（BUILD_STATUS.md 参照）
import { LoadingView } from "@/components/loading-view";

export default LoadingView;
