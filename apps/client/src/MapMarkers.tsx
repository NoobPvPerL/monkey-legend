export default function MapMarkers({poison,bomb,water,desert=false,bombTitle='轰炸'}:{poison:boolean;bomb:boolean;water:boolean;desert?:boolean;bombTitle?:string}){
 return <span className="map-markers" aria-hidden="true">{water&&<span className="terrain-badge water-badge" title="水域">≈</span>}{desert&&<span className="terrain-badge desert-badge" title="沙漠">沙</span>}{poison&&<span className="hazard-badge poison-badge" title="毒圈">☠</span>}{bomb&&<span className="hazard-badge bomb-badge" title={bombTitle}>✹</span>}</span>;
}
