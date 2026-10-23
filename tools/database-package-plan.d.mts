export const DATABASE_UPGRADE_BASES:readonly number[];
export interface DatabaseMigration {file:string;body:string}
export function databasePackagePlan(version:string,migrations:DatabaseMigration[],upgrade?:boolean):{migrations:DatabaseMigration[];files:Record<string,string>};
