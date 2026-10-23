export const P3_DELIVERY_PROFILE:Record<string,string|number>;
export function hash(bytes:string|Buffer):string;
export function p3UpgradeFile(base:number):string;
export function containedPath(root:string,file:string):string;
export function assertP3Manifests(sm:any,dm:any):void;
export function verifyManifest(root:string,manifest:{files:Record<string,string>}):Promise<void>;
