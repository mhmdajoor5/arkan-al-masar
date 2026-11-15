export const ledgerCategories=[['supplier','الموردون','Suppliers'],['customer','العملاء','Customers'],['driver','السائقون','Drivers'],['purchase','المشتريات','Purchases'],['management','الإدارة','Administration'],['debt','الديون','Debts'],['rent','الإيجارات الشهرية','Monthly rent']] as const;
export type LedgerPair={from:{category:string;name:string};to:{category:string;name:string};amount:number};
// Totals for a set of accounts. A transfer between two accounts in the set is
// internal: it adds the same amount to debit and credit, so remove it there.
export function accountTotals(accounts:{category:string;name:string;debit?:number;credit?:number;balance?:number}[],pairs:LedgerPair[]){
 const keys=new Set(accounts.map(a=>JSON.stringify([a.category,a.name])));
 let debit=accounts.reduce((n,a)=>n+Number(a.debit||0),0),credit=accounts.reduce((n,a)=>n+Number(a.credit||0),0);
 const balance=accounts.reduce((n,a)=>n+Number(a.balance||0),0);
 for(const pair of pairs)if(keys.has(JSON.stringify([pair.from.category,pair.from.name]))&&keys.has(JSON.stringify([pair.to.category,pair.to.name]))){debit-=pair.amount;credit-=pair.amount}
 return{debit,credit,balance};
}
