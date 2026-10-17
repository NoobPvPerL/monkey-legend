export default function MapMarkers({poison,bomb,water,bombTitle='轰炸'}:{poison:boolean;bomb:boolean;water:boolean;bombTitle?:string}){
 return <span className="map-markers" aria-hidden="true">{poison&&<span className="hazard-badge poison-badge" title="毒圈">☠</span>}{bomb&&<span className="hazard-badge bomb-badge" title={bombTitle}>✹</span>}{water&&<span className="water-badge" title="水域">≈</span>}</span>;
}
